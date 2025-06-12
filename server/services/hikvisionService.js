import axios from 'axios';
import crypto from 'crypto';
import https from 'https';

class HikvisionService {
  constructor() {
    this.deviceIP = process.env.HIKVISION_DEVICE_IP;
    this.username = process.env.HIKVISION_USERNAME;
    this.password = process.env.HIKVISION_PASSWORD;
    this.useHttps = process.env.HIKVISION_USE_HTTPS === 'true';
    this.timeout = parseInt(process.env.HIKVISION_TIMEOUT) || 30000;

    this.baseURL = `${this.useHttps ? 'https' : 'http'}://${this.deviceIP}`;

    // Create axios instance with custom config
    this.client = axios.create({
      timeout: this.timeout,
      // Disable SSL verification for self-signed certificates
      httpsAgent: this.useHttps
        ? new https.Agent({
            rejectUnauthorized: false,
          })
        : undefined,
    });
  }

  /**
   * Generate MD5 hash
   */
  md5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Parse WWW-Authenticate header for Digest authentication
   */
  parseDigestHeader(authHeader) {
    const digest = {};
    const regex = /(\w+)=["']?([^"',]+)["']?/g;
    let match;

    while ((match = regex.exec(authHeader)) !== null) {
      digest[match[1]] = match[2];
    }

    return digest;
  }

  /**
   * Generate Digest Authentication header
   */
  generateDigestAuth(method, uri, digestParams) {
    const nc = '00000001';
    const cnonce = crypto.randomBytes(16).toString('hex');

    // Calculate HA1
    const ha1 = this.md5(
      `${this.username}:${digestParams.realm}:${this.password}`
    );

    // Calculate HA2
    const ha2 = this.md5(`${method}:${uri}`);

    // Calculate response
    const response = this.md5(
      `${ha1}:${digestParams.nonce}:${nc}:${cnonce}:${digestParams.qop}:${ha2}`
    );

    return `Digest username="${this.username}", realm="${digestParams.realm}", nonce="${digestParams.nonce}", uri="${uri}", qop=${digestParams.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
  }

  /**
   * Make authenticated request to Hikvision device
   */
  async makeAuthenticatedRequest(method, endpoint, data = null, headers = {}) {
    const url = `${this.baseURL}${endpoint}`;

    try {
      // First request to get authentication challenge
      const initialResponse = await this.client.request({
        method,
        url,
        data,
        headers,
        validateStatus: (status) =>
          status === 401 || (status >= 200 && status < 300),
      });

      // If we get 401, handle Digest authentication
      if (initialResponse.status === 401) {
        const authHeader = initialResponse.headers['www-authenticate'];

        if (!authHeader || !authHeader.includes('Digest')) {
          throw new Error('Device does not support Digest authentication');
        }

        const digestParams = this.parseDigestHeader(authHeader);
        const authHeaderValue = this.generateDigestAuth(
          method,
          endpoint,
          digestParams
        );

        // Make authenticated request
        const authenticatedResponse = await this.client.request({
          method,
          url,
          data,
          headers: {
            ...headers,
            Authorization: authHeaderValue,
          },
        });

        return authenticatedResponse;
      }

      return initialResponse;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(
          `Cannot connect to Hikvision device at ${this.deviceIP}`
        );
      } else if (error.code === 'ETIMEDOUT') {
        throw new Error(
          `Connection timeout to Hikvision device at ${this.deviceIP}`
        );
      }
      throw error;
    }
  }

  /**
   * Test connection to Hikvision device
   */
  async testConnection() {
    try {
      const response = await this.makeAuthenticatedRequest(
        'GET',
        '/ISAPI/System/deviceInfo'
      );
      return {
        success: true,
        deviceInfo: response.data,
        status: response.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || null,
      };
    }
  }

  /**
   * Get face database information
   */
  async getFaceDatabase() {
    try {
      const response = await this.makeAuthenticatedRequest(
        'GET',
        '/ISAPI/Intelligent/FDLib'
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || null,
      };
    }
  }

  /**
   * Enroll face to Hikvision device
   */
  async enrollFace(personId, imageBuffer, personName = '') {
    try {
      // Convert image buffer to base64
      const imageBase64 = imageBuffer.toString('base64');

      // Prepare face data according to Hikvision ISAPI specification
      const faceData = {
        faceLibType: 'blackFD',
        FDID: '1', // Face database ID (usually 1 for main database)
        FPID: personId.toString(), // Face picture ID (using our person ID)
        name: personName || `Person_${personId}`,
        bornTime: new Date().toISOString().split('T')[0], // Current date as birth date
        sex: 'unknown',
        faceURL: `data:image/jpeg;base64,${imageBase64}`,
      };

      // Send face enrollment request
      const response = await this.makeAuthenticatedRequest(
        'POST',
        '/ISAPI/Intelligent/FDLib/FDSet',
        faceData,
        {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }
      );

      return {
        success: true,
        data: response.data,
        status: response.status,
        message: 'Face enrolled successfully to Hikvision device',
      };
    } catch (error) {
      console.error(
        'Hikvision enrollment error:',
        error.response?.data || error.message
      );

      return {
        success: false,
        error: error.message,
        details: error.response?.data || null,
        status: error.response?.status || null,
      };
    }
  }

  /**
   * Delete face from Hikvision device
   */
  async deleteFace(personId) {
    try {
      const response = await this.makeAuthenticatedRequest(
        'DELETE',
        `/ISAPI/Intelligent/FDLib/FDSet?FDID=1&FPID=${personId}`
      );

      return {
        success: true,
        data: response.data,
        status: response.status,
        message: 'Face deleted successfully from Hikvision device',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || null,
        status: error.response?.status || null,
      };
    }
  }

  /**
   * Get device status and capabilities
   */
  async getDeviceCapabilities() {
    try {
      const response = await this.makeAuthenticatedRequest(
        'GET',
        '/ISAPI/Intelligent/FDLib/capabilities'
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data || null,
      };
    }
  }
}

export default HikvisionService;
