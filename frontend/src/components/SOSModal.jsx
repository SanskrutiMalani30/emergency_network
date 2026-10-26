import React, { useState } from 'react';
import { X, AlertCircle, Phone, MapPin, Radio, CheckCircle } from 'lucide-react';
import { sendSOS } from '../services/api';

export default function SOSModal({ isOpen, onClose, currentCoords, onSOSSent }) {
  const [phone, setPhone] = useState('+91 94231 88910');
  const [message, setMessage] = useState('Critical distress: urgent evacuation needed.');
  const [transmitting, setTransmitting] = useState(false);
  const [transmitted, setTransmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const lat = currentCoords?.lat || 21.1458;
  const lng = currentCoords?.lng || 79.0882;

  const handleTransmit = async () => {
    setTransmitting(true);
    setErrorMsg('');
    try {
      const res = await sendSOS({ lat, lng }, phone, message);
      setTransmitted(true);
      if (onSOSSent) onSOSSent(res);
    } catch (err) {
      setErrorMsg(err.message || 'Distress beacon transmission failed');
    } finally {
      setTransmitting(false);
    }
  };

  const handleClose = () => {
    setTransmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center p-4 bg-red-950/70 backdrop-blur-sm">
      <div className="bg-white border-2 border-red-600 w-full max-w-md rounded-sm shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 bg-red-600 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Radio className="w-5 h-5 animate-pulse" />
            <h2 className="font-heading font-bold text-base uppercase tracking-wider">
              Emergency SOS Distress Beacon
            </h2>
          </div>
          <button onClick={handleClose} className="text-red-200 hover:text-white p-1 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          
          {transmitted ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="font-heading font-bold text-lg text-red-700 uppercase">
                BEACON ACTIVE & BROADCASTING
              </h3>
              <p className="text-xs text-espresso-700 max-w-xs mx-auto">
                Your high-priority SOS alert has been prioritized by Tactical Command. Nearest rescue units and volunteers are being alerted.
              </p>
              <button
                onClick={handleClose}
                className="mt-3 px-6 py-2 bg-espresso hover:bg-espresso-800 text-white font-mono text-xs uppercase rounded-sm"
              >
                Close Beacon
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 p-3 rounded-sm text-xs text-red-900 leading-relaxed font-sans">
                Deploying this beacon immediately broadcasts your exact coordinates to all emergency nodes and marks your location with a critical red strobe.
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-mono uppercase text-espresso-700 mb-1 font-bold">
                    GPS Coordinates
                  </label>
                  <div className="p-2.5 bg-parchment rounded-sm border border-tactical-border font-mono text-espresso flex items-center space-x-2">
                    <MapPin className="w-4 h-4 text-red-600" />
                    <span>{lat.toFixed(5)}°N, {lng.toFixed(5)}°E</span>
                  </div>
                </div>

                <div>
                  <label className="block font-mono uppercase text-espresso-700 mb-1 font-bold">
                    Direct Callback Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-2.5 bg-parchment rounded-sm border border-tactical-border focus:border-red-600 text-espresso font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-mono uppercase text-espresso-700 mb-1 font-bold">
                    Short Distress Note
                  </label>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full p-2.5 bg-parchment rounded-sm border border-tactical-border focus:border-red-600 text-espresso focus:outline-none text-xs"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 bg-red-100 text-red-800 text-xs rounded-sm">
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleTransmit}
                disabled={transmitting}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-sm shadow-lg flex items-center justify-center space-x-2 transition"
              >
                <Radio className={`w-4 h-4 ${transmitting ? 'animate-spin' : ''}`} />
                <span>{transmitting ? 'BROADCASTING...' : 'TRANSMIT SOS BEACON NOW'}</span>
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
