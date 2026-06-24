import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, Package, AlertCircle, CheckCircle, X, RefreshCw, Keyboard, ScanLine } from 'lucide-react';
import { supabase, InventoryItem } from '../../lib/supabase';

type ScanResult = {
  type: 'found' | 'not_found' | 'error';
  item?: InventoryItem;
  barcode?: string;
  message?: string;
};

type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';
type ScannerMode = 'usb' | 'camera';

export function Scanner() {
  const [scannerMode, setScannerMode] = useState<ScannerMode>('usb');
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('0');
  const [newItemSupplier, setNewItemSupplier] = useState('');
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [processedBarcodes, setProcessedBarcodes] = useState<Set<string>>(new Set());
  const [manualBarcode, setManualBarcode] = useState('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const containerId = 'qr-reader';
  const usbInputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkCameraSupport = useCallback(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return false;
    }
    return true;
  }, []);

  const stopCameraScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const scanner = scannerRef.current;
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch {
        // Ignore errors during stop
      }
      scannerRef.current = null;
    }
    setCameraState('idle');
    lastScannedRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // USB Scanner: Global keyboard listener for barcode scanner input
  useEffect(() => {
    if (scannerMode !== 'usb') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const currentTime = Date.now();
      const timeSinceLastKey = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      // If more than 100ms between keystrokes, it's likely manual typing, not scanner
      // But we still want to capture the input
      if (timeSinceLastKey > 100 && barcodeBufferRef.current) {
        // Reset buffer if it seems like manual typing
        barcodeBufferRef.current = '';
      }

      // Handle Enter key - scanner typically sends Enter at end of barcode
      if (e.key === 'Enter') {
        const barcode = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';

        if (barcode && barcode.length > 2) {
          e.preventDefault();
          handleBarcodeScanned(barcode);
        }
        return;
      }

      // Only capture printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scannerMode]);

  // Focus USB input when switching to USB mode
  useEffect(() => {
    if (scannerMode === 'usb' && usbInputRef.current) {
      usbInputRef.current.focus();
    }
  }, [scannerMode]);

  async function handleBarcodeScanned(barcode: string) {
    if (lastScannedRef.current === barcode) return;
    lastScannedRef.current = barcode;
    setScanResult(null);

    if (processedBarcodes.has(barcode)) {
      setScanResult({
        type: 'error',
        barcode,
        message: 'Already scanned this barcode',
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('barcode', barcode)
        .single();

      if (error || !data) {
        setScanResult({
          type: 'not_found',
          barcode,
        });
        setPendingBarcode(barcode);
      } else {
        setScanResult({
          type: 'found',
          item: data,
          barcode,
        });
        setProcessedBarcodes(prev => new Set(prev).add(barcode));
      }
    } catch {
      setScanResult({
        type: 'error',
        barcode,
        message: 'Failed to lookup barcode',
      });
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      handleBarcodeScanned(manualBarcode.trim());
      setManualBarcode('');
    }
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    if (!checkCameraSupport()) {
      setCameraState('unavailable');
      setErrorMessage('Camera is not supported in this browser. Please use a modern browser with camera access.');
      return false;
    }

    try {
      setCameraState('requesting');
      setErrorMessage(null);

      // Explicitly request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      // Permission granted - stop the test stream immediately
      stream.getTracks().forEach(track => track.stop());

      return true;
    } catch {
      setCameraState('denied');
      setErrorMessage(
        'Camera permission was denied. Please allow camera access in your browser settings and try again.'
      );
      return false;
    }
  };

  const startCameraScanner = async () => {
    setScanResult(null);

    // Check camera support
    if (!checkCameraSupport()) {
      setCameraState('unavailable');
      setErrorMessage('Camera is not supported in this browser. Please use a modern browser with camera access.');
      return;
    }

    // Request permission first
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      return;
    }

    try {
      setCameraState('requesting');

      // Small delay for mobile browsers to release the test stream
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create scanner instance
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      // Get available cameras to ensure we have a camera
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setCameraState('unavailable');
        setErrorMessage('No camera found on this device. Please connect a camera and try again.');
        scannerRef.current = null;
        return;
      }

      // Find back camera if available
      let cameraId: string | undefined;
      const backCamera = devices.find(
        d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear')
      );
      cameraId = backCamera?.id || devices[0]?.id;

      // Start scanning
      await scanner.start(
        cameraId || { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        async (decodedText: string) => {
          if (lastScannedRef.current === decodedText) return;
          lastScannedRef.current = decodedText;

          if (processedBarcodes.has(decodedText)) {
            setScanResult({
              type: 'error',
              barcode: decodedText,
              message: 'Already scanned this barcode',
            });
            return;
          }

          try {
            const { data, error } = await supabase
              .from('inventory_items')
              .select('*')
              .eq('barcode', decodedText)
              .single();

            if (error || !data) {
              setScanResult({
                type: 'not_found',
                barcode: decodedText,
              });
              setPendingBarcode(decodedText);
            } else {
              setScanResult({
                type: 'found',
                item: data,
                barcode: decodedText,
              });
              setProcessedBarcodes(prev => new Set(prev).add(decodedText));
            }
          } catch {
            setScanResult({
              type: 'error',
              barcode: decodedText,
              message: 'Failed to lookup barcode',
            });
          }
        },
        () => {}
      );

      setCameraState('active');
    } catch {
      setCameraState('error');
      setErrorMessage(
        'Failed to start camera. Please ensure no other app is using the camera and try again.'
      );
      scannerRef.current = null;
    }
  };

  async function incrementQuantity(item: InventoryItem) {
    const { error } = await supabase
      .from('inventory_items')
      .update({ quantity: item.quantity + 1 })
      .eq('id', item.id);

    if (!error && scanResult?.type === 'found') {
      setScanResult({
        ...scanResult,
        item: { ...item, quantity: item.quantity + 1 },
      });
    }
  }

  async function addNewItem() {
    if (!pendingBarcode || !newItemName) return;

    const { data, error } = await supabase
      .from('inventory_items')
      .insert({
        name: newItemName,
        barcode: pendingBarcode,
        quantity: 1,
        price: parseFloat(newItemPrice) || 0,
        supplier: newItemSupplier || '',
      })
      .select()
      .single();

    if (!error && data) {
      setScanResult({
        type: 'found',
        item: data,
        barcode: pendingBarcode,
      });
      setProcessedBarcodes(prev => new Set(prev).add(pendingBarcode));
      setShowAddForm(false);
      setNewItemName('');
      setNewItemPrice('0');
      setNewItemSupplier('');
      setPendingBarcode(null);
    }
  }

  function dismissResult() {
    setScanResult(null);
    setShowAddForm(false);
    setNewItemName('');
    setNewItemPrice('0');
    setNewItemSupplier('');
    setPendingBarcode(null);
    lastScannedRef.current = null;
    if (scannerMode === 'usb' && usbInputRef.current) {
      usbInputRef.current.focus();
    }
  }

  const isScanning = cameraState === 'active';
  const isRequesting = cameraState === 'requesting';

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <header className="bg-white px-4 py-4 shadow-sm border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">Scanner</h1>
        <p className="text-sm text-gray-500 mt-1">Scan barcodes to look up or add items</p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {/* Mode Toggle */}
        <div className="mb-6">
          <div className="bg-white rounded-xl p-1 shadow-sm border border-gray-200 flex">
            <button
              onClick={() => {
                setScannerMode('usb');
                stopCameraScanner();
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-colors ${
                scannerMode === 'usb'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Keyboard className="w-5 h-5" />
              <span className="font-medium">USB Scanner</span>
            </button>
            <button
              onClick={() => {
                setScannerMode('camera');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-colors ${
                scannerMode === 'camera'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Camera className="w-5 h-5" />
              <span className="font-medium">Camera</span>
            </button>
          </div>
        </div>

        {/* USB Scanner Mode */}
        {scannerMode === 'usb' && (
          <div className="mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <ScanLine className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">USB Barcode Scanner</h3>
                  <p className="text-sm text-gray-500">Ready to scan - just point and scan</p>
                </div>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Barcode Input
                  </label>
                  <input
                    ref={usbInputRef}
                    type="text"
                    value={manualBarcode}
                    onChange={e => setManualBarcode(e.target.value)}
                    placeholder="Scan barcode or type manually..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-lg text-gray-900 placeholder:text-gray-400"
                    autoComplete="off"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium"
                  >
                    Look Up Barcode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManualBarcode('');
                      lastScannedRef.current = null;
                    }}
                    className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                  >
                    Clear
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-800">
                    <strong>USB Scanner Active:</strong> This field automatically captures input from USB barcode scanners. Just scan any barcode and it will be looked up instantly. You can also type barcodes manually and press Enter.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Camera Scanner Mode */}
        {scannerMode === 'camera' && (
          <div className="mb-6">
            <div
              id={containerId}
              className={`w-full aspect-square max-w-sm mx-auto rounded-2xl overflow-hidden border-2 ${
                isScanning ? 'border-blue-500' : 'border-gray-200'
              } bg-gray-900`}
            >
              {!isScanning && !isRequesting && (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <Camera className="w-16 h-16 mb-3" />
                  <p className="text-sm">Camera preview</p>
                </div>
              )}
              {isRequesting && (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <RefreshCw className="w-12 h-12 mb-3 animate-spin" />
                  <p className="text-sm">Requesting camera access...</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-center">
              {!isScanning && !isRequesting ? (
                <button
                  onClick={startCameraScanner}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-md"
                >
                  <Camera className="w-5 h-5" />
                  Start Scanning
                </button>
              ) : (
                <button
                  onClick={stopCameraScanner}
                  className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-xl hover:bg-red-700 transition-colors shadow-md"
                >
                  <CameraOff className="w-5 h-5" />
                  Stop Scanning
                </button>
              )}
            </div>

            {/* Camera Unavailable */}
            {cameraState === 'unavailable' && (
              <div className="bg-gray-50 border border-gray-300 rounded-xl p-4 mt-4">
                <div className="flex items-start gap-3">
                  <CameraOff className="w-6 h-6 text-gray-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Camera Not Available</h3>
                    <p className="text-sm text-gray-600 mt-1">{errorMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Permission Denied */}
            {cameraState === 'denied' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-900">Camera Permission Denied</h3>
                    <p className="text-sm text-amber-700 mt-1">{errorMessage}</p>
                    <button
                      onClick={startCameraScanner}
                      className="mt-3 text-sm font-medium text-amber-800 hover:text-amber-900 underline"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Camera Error */}
            {cameraState === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900">Camera Error</h3>
                    <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
                    <button
                      onClick={startCameraScanner}
                      className="mt-3 text-sm font-medium text-red-800 hover:text-red-900 underline"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Scan Result */}
        {scanResult && !showAddForm && (
          <div
            className={`rounded-xl p-4 border ${
              scanResult.type === 'found'
                ? 'bg-green-50 border-green-200'
                : scanResult.type === 'not_found'
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {scanResult.type === 'found' ? (
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              ) : scanResult.type === 'not_found' ? (
                <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                {scanResult.type === 'found' && scanResult.item ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-green-900">{scanResult.item.name}</h3>
                      <span className="text-lg font-bold text-green-700">${Number(scanResult.item.price).toFixed(2)}</span>
                    </div>
                    <p className="text-sm text-green-700 mt-1 font-mono">{scanResult.barcode}</p>
                    {scanResult.item.supplier && (
                      <span className="inline-block mt-2 px-2.5 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                        {scanResult.item.supplier}
                      </span>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <div>
                        <p className="text-sm text-green-700">Stock</p>
                        <p className="text-2xl font-bold text-green-900">{scanResult.item.quantity}</p>
                      </div>
                      <button
                        onClick={() => incrementQuantity(scanResult.item!)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                      >
                        +1 Stock
                      </button>
                    </div>
                  </>
                ) : scanResult.type === 'not_found' ? (
                  <>
                    <h3 className="font-semibold text-amber-900">Item Not Found</h3>
                    <p className="text-sm text-amber-700 mt-1 font-mono">{scanResult.barcode}</p>
                    <p className="text-sm text-amber-700 mt-2">
                      This barcode is not in your inventory. Add it as a new item?
                    </p>
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="mt-3 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
                    >
                      Add New Item
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold text-red-900">Error</h3>
                    <p className="text-sm text-red-700 mt-1">{scanResult.message}</p>
                    {scanResult.barcode && (
                      <p className="text-sm text-red-700 mt-1 font-mono">{scanResult.barcode}</p>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={dismissResult}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Add New Item Form */}
        {showAddForm && pendingBarcode && (
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Add New Item</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
                <input
                  type="text"
                  value={pendingBarcode}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter item name"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newItemPrice}
                  onChange={e => setNewItemPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                <input
                  type="text"
                  value={newItemSupplier}
                  onChange={e => setNewItemSupplier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Supplier name"
                />
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewItemName('');
                    setNewItemPrice('0');
                    setNewItemSupplier('');
                    setPendingBarcode(null);
                    lastScannedRef.current = null;
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={addNewItem}
                  disabled={!newItemName}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Item
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Scanned Items List */}
        {processedBarcodes.size > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Previously Scanned ({processedBarcodes.size})
            </h3>
            <div className="flex flex-wrap gap-2">
              {Array.from(processedBarcodes).map(barcode => (
                <span
                  key={barcode}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg font-mono"
                >
                  {barcode}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        {scannerMode === 'camera' && cameraState === 'idle' && !scanResult && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Package className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-blue-900">How to use camera mode</h3>
                <ul className="text-sm text-blue-700 mt-2 space-y-1.5">
                  <li>1. Tap "Start Scanning" to activate the camera</li>
                  <li>2. Allow camera permission when prompted</li>
                  <li>3. Point the camera at a barcode</li>
                  <li>4. The app will automatically look up the item</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
