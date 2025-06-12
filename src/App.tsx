import React, { useState, useEffect } from 'react';
import { Search, Upload, Users, Database, CheckCircle, AlertCircle, Wifi, WifiOff, Settings, ChevronDown, ChevronUp } from 'lucide-react';

interface Person {
  personaID: number;
  nombre: string | null;
  apellido: string | null;
  activeFaces: number;
  totalFaces: number;
}

interface Pagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface PersonsResponse {
  personas: Person[];
  pagination: Pagination;
}

interface HealthStatus {
  status: string;
  database: string;
  hikvision: {
    configured: boolean;
    connected: boolean;
    device: string;
  };
}

function App() {
  const [persons, setPersons] = useState<Person[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error' | 'warning', text: string} | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [showDevicePanel, setShowDevicePanel] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  // Fetch persons
  const fetchPersons = async (page: number = 1, search: string = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        ...(search && { search })
      });
      
      const response = await fetch(`/api/personas?${params}`);
      const data: PersonsResponse = await response.json();
      
      setPersons(data.personas);
      setPagination(data.pagination);
    } catch (error) {
      showMessage('error', 'Failed to fetch persons');
    }
    setLoading(false);
  };

  // Check health status
  const checkHealth = async () => {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setHealthStatus(data);
    } catch (error) {
      setHealthStatus({ 
        status: 'unhealthy', 
        database: 'disconnected',
        hikvision: { configured: false, connected: false, device: 'not configured' }
      });
    }
  };

  // Test Hikvision connection
  const testHikvisionConnection = async () => {
    setTestingConnection(true);
    try {
      const response = await fetch('/api/hikvision/status');
      const data = await response.json();
      
      if (data.success) {
        setDeviceInfo(data.deviceInfo);
        showMessage('success', 'Successfully connected to Hikvision device');
      } else {
        showMessage('error', `Connection failed: ${data.error}`);
      }
      
      // Refresh health status
      checkHealth();
    } catch (error) {
      showMessage('error', 'Failed to test connection');
    }
    setTestingConnection(false);
  };

  // Show message
  const showMessage = (type: 'success' | 'error' | 'warning', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Handle search
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchPersons(1, searchTerm);
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedPerson || !uploadFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', uploadFile);

      const response = await fetch(`/api/enroll/${selectedPerson.personaID}`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (response.ok) {
        let message = `Face enrolled to database successfully! Deactivated ${result.deactivatedFaces} previous faces.`;
        
        if (result.hikvision.success) {
          showMessage('success', `${message} Also enrolled to Hikvision device.`);
        } else {
          showMessage('warning', `${message} Warning: Device enrollment failed - ${result.hikvision.message}`);
        }
        
        setSelectedPerson(null);
        setUploadFile(null);
        fetchPersons(currentPage, searchTerm); // Refresh list
      } else {
        showMessage('error', result.error || 'Upload failed');
      }
    } catch (error) {
      showMessage('error', 'Failed to upload image');
    }
    setUploading(false);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchPersons(page, searchTerm);
  };

  useEffect(() => {
    fetchPersons();
    checkHealth();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800/80 backdrop-blur-sm border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Database className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Hikvision Facial Recognition</h1>
                <p className="text-gray-400 text-sm">Enrollment Management System</p>
              </div>
            </div>
            
            {/* Status Indicators */}
            <div className="flex items-center space-x-6">
              {/* Database Status */}
              <div className="flex items-center space-x-2">
                {healthStatus?.database === 'connected' ? (
                  <CheckCircle className="h-5 w-5 text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                )}
                <span className="text-sm font-medium">
                  DB: {healthStatus?.database || 'checking...'}
                </span>
              </div>

              {/* Hikvision Status */}
              <div className="flex items-center space-x-2">
                {healthStatus?.hikvision.connected ? (
                  <Wifi className="h-5 w-5 text-green-400" />
                ) : (
                  <WifiOff className="h-5 w-5 text-red-400" />
                )}
                <span className="text-sm font-medium">
                  Device: {healthStatus?.hikvision.connected ? 'Connected' : 'Offline'}
                </span>
              </div>

              {/* Settings Button */}
              <button
                onClick={() => setShowDevicePanel(!showDevicePanel)}
                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Device Settings Panel */}
          {showDevicePanel && (
            <div className="mt-6 bg-gray-700/50 rounded-lg p-4 border border-gray-600">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center">
                  <Settings className="h-5 w-5 mr-2" />
                  Device Configuration
                </h3>
                <button
                  onClick={() => setShowDevicePanel(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <ChevronUp className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Device IP</label>
                  <div className="text-sm text-gray-100 bg-gray-800 px-3 py-2 rounded">
                    {healthStatus?.hikvision.device || 'Not configured'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
                  <div className={`text-sm px-3 py-2 rounded flex items-center ${
                    healthStatus?.hikvision.connected 
                      ? 'bg-green-900 text-green-100' 
                      : 'bg-red-900 text-red-100'
                  }`}>
                    {healthStatus?.hikvision.connected ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Connected
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 mr-2" />
                        Disconnected
                      </>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={testHikvisionConnection}
                disabled={testingConnection || !healthStatus?.hikvision.configured}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
              >
                {testingConnection ? 'Testing...' : 'Test Connection'}
              </button>

              {deviceInfo && (
                <div className="mt-4 p-3 bg-gray-800 rounded text-sm">
                  <h4 className="font-medium mb-2">Device Information:</h4>
                  <pre className="text-gray-300 text-xs overflow-x-auto">
                    {JSON.stringify(deviceInfo, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Message Alert */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg border ${
            message.type === 'success' 
              ? 'bg-green-900/50 border-green-700 text-green-100' 
              : message.type === 'warning'
              ? 'bg-yellow-900/50 border-yellow-700 text-yellow-100'
              : 'bg-red-900/50 border-red-700 text-red-100'
          }`}>
            <div className="flex items-center">
              {message.type === 'success' ? (
                <CheckCircle className="h-5 w-5 mr-2" />
              ) : message.type === 'warning' ? (
                <AlertCircle className="h-5 w-5 mr-2" />
              ) : (
                <AlertCircle className="h-5 w-5 mr-2" />
              )}
              {message.text}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="mb-8">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or surname..."
                className="w-full pl-10 pr-4 py-3 bg-gray-800/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent backdrop-blur-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </form>
        </div>

        {/* Person Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {persons.map((person) => (
            <div
              key={person.personaID}
              className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50 hover:border-blue-500/50 transition-all duration-300 cursor-pointer hover:shadow-xl hover:shadow-blue-500/10 group"
              onClick={() => setSelectedPerson(person)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-300 transition-colors">
                    {person.nombre || 'No Name'} {person.apellido || ''}
                  </h3>
                  <p className="text-gray-400 text-sm mb-4">ID: {person.personaID}</p>
                  
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-green-400 rounded-full shadow-lg shadow-green-400/50"></div>
                      <span className="text-green-300">{person.activeFaces} Active</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                      <span className="text-gray-300">{person.totalFaces} Total</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-3 bg-blue-600/20 rounded-lg group-hover:bg-blue-600/30 transition-colors">
                  <Users className="h-6 w-6 text-blue-400" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between bg-gray-800/30 backdrop-blur-sm rounded-lg p-4 border border-gray-700/50">
            <p className="text-gray-400">
              Showing {((pagination.currentPage - 1) * 18) + 1} to {Math.min(pagination.currentPage * 18, pagination.totalItems)} of {pagination.totalItems} people
            </p>
            
            <div className="flex space-x-2">
              <button
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={!pagination.hasPrev}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors"
              >
                Previous
              </button>
              
              <span className="px-4 py-2 bg-gray-800 rounded-lg border border-gray-600">
                Page {pagination.currentPage} of {pagination.totalPages}
              </span>
              
              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={!pagination.hasNext}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {selectedPerson && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700 shadow-2xl">
            <h2 className="text-xl font-bold mb-4">
              Enroll Face for {selectedPerson.nombre} {selectedPerson.apellido}
            </h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                Upload Face Image (.jpg or .png)
              </label>
              
              <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="file-upload"
                />
                
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
                >
                  Choose File
                </label>
                
                {uploadFile && (
                  <p className="mt-2 text-sm text-green-400">
                    Selected: {uploadFile.name}
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setSelectedPerson(null);
                  setUploadFile(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              
              <button
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
              >
                {uploading ? 'Enrolling...' : 'Enroll Face'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;