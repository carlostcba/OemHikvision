import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import HikvisionService from './services/hikvisionService.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const prisma = new PrismaClient();
const hikvisionService = new HikvisionService();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only .jpg and .png files are allowed'));
    }
  },
});

// API Routes

// GET /personas - Search people with pagination
app.get('/api/personas', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.search || '';
    const limit = 18;
    const skip = (page - 1) * limit;

    const where = search ? {
      OR: [
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido: { contains: search, mode: 'insensitive' } }
      ]
    } : {};

    const [personas, total] = await Promise.all([
      prisma.per.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { nombre: 'asc' },
          { apellido: 'asc' }
        ],
        include: {
          faces: {
            include: {
              face: true
            }
          }
        }
      }),
      prisma.per.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      personas: personas.map(persona => ({
        ...persona,
        activeFaces: persona.faces.filter(pf => pf.face.activo).length,
        totalFaces: persona.faces.length
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching personas:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /enroll/:personaID - Enroll face for a person
app.post('/api/enroll/:personaID', upload.single('image'), async (req, res) => {
  try {
    const personaID = parseInt(req.params.personaID);
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Verify person exists
    const persona = await prisma.per.findUnique({
      where: { personaID }
    });

    if (!persona) {
      return res.status(404).json({ error: 'Person not found' });
    }

    // Start transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // First, deactivate all existing faces for this person
      const existingFaces = await tx.perface.findMany({
        where: { personaID },
        include: { face: true }
      });

      if (existingFaces.length > 0) {
        const faceIds = existingFaces.map(pf => pf.facialID);
        await tx.face.updateMany({
          where: { facialID: { in: faceIds } },
          data: { activo: false }
        });
      }

      // Create new face with uploaded image data
      const newFace = await tx.face.create({
        data: {
          templateData: req.file.buffer,
          activo: true
        }
      });

      // Associate face with person
      await tx.perface.create({
        data: {
          personaID,
          facialID: newFace.facialID
        }
      });

      return newFace;
    });

    // After successful database operation, enroll to Hikvision device
    let hikvisionResult = null;
    let hikvisionError = null;

    try {
      const personName = `${persona.nombre || ''} ${persona.apellido || ''}`.trim() || `Person_${personaID}`;
      hikvisionResult = await hikvisionService.enrollFace(personaID, req.file.buffer, personName);
      
      if (!hikvisionResult.success) {
        hikvisionError = hikvisionResult.error;
        console.warn('Hikvision enrollment failed:', hikvisionResult);
      }
    } catch (error) {
      hikvisionError = error.message;
      console.error('Hikvision service error:', error);
    }

    const deactivatedCount = await prisma.perface.count({
      where: { 
        personaID,
        face: { activo: false }
      }
    });

    res.json({
      success: true,
      message: 'Face enrolled successfully to database',
      faceId: result.facialID,
      deactivatedFaces: deactivatedCount,
      hikvision: {
        success: hikvisionResult?.success || false,
        message: hikvisionResult?.message || hikvisionError || 'Device enrollment failed',
        error: hikvisionError
      }
    });

  } catch (error) {
    console.error('Error enrolling face:', error);
    res.status(500).json({ error: 'Failed to enroll face' });
  }
});

// GET /personas/:id - Get specific person details
app.get('/api/personas/:id', async (req, res) => {
  try {
    const personaID = parseInt(req.params.id);
    
    const persona = await prisma.per.findUnique({
      where: { personaID },
      include: {
        faces: {
          include: {
            face: true
          },
          orderBy: {
            face: {
              createdAt: 'desc'
            }
          }
        }
      }
    });

    if (!persona) {
      return res.status(404).json({ error: 'Person not found' });
    }

    res.json({
      ...persona,
      faces: persona.faces.map(pf => ({
        facialID: pf.face.facialID,
        activo: pf.face.activo,
        createdAt: pf.face.createdAt,
        hasImage: !!pf.face.templateData
      }))
    });
  } catch (error) {
    console.error('Error fetching person:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /hikvision/status - Test Hikvision device connection
app.get('/api/hikvision/status', async (req, res) => {
  try {
    const result = await hikvisionService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to test Hikvision connection',
      details: error.message
    });
  }
});

// GET /hikvision/capabilities - Get device capabilities
app.get('/api/hikvision/capabilities', async (req, res) => {
  try {
    const result = await hikvisionService.getDeviceCapabilities();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get device capabilities',
      details: error.message
    });
  }
});

// GET /hikvision/database - Get face database info
app.get('/api/hikvision/database', async (req, res) => {
  try {
    const result = await hikvisionService.getFaceDatabase();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get face database info',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    // Test Hikvision connection
    const hikvisionStatus = await hikvisionService.testConnection();
    
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      hikvision: {
        configured: !!(process.env.HIKVISION_DEVICE_IP && process.env.HIKVISION_USERNAME),
        connected: hikvisionStatus.success,
        device: process.env.HIKVISION_DEVICE_IP || 'not configured'
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'disconnected',
      hikvision: {
        configured: !!(process.env.HIKVISION_DEVICE_IP && process.env.HIKVISION_USERNAME),
        connected: false,
        device: process.env.HIKVISION_DEVICE_IP || 'not configured'
      }
    });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database provider: ${process.env.DATABASE_URL?.split(':')[0] || 'not configured'}`);
  console.log(`Hikvision device: ${process.env.HIKVISION_DEVICE_IP || 'not configured'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await prisma.$disconnect();
  process.exit(0);
});