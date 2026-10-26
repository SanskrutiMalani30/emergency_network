import React, { useState } from 'react';
import { X, Truck, Package, Check, ArrowRight, ShieldCheck, Plus, RefreshCw } from 'lucide-react';
import { allocateRelief } from '../services/api';

export default function ReliefOperationsModal({
  isOpen,
  onClose,
  depots = [],
  vehicles = [],
  incidents = [],
  onReloadData
}) {
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const [selectedDepotId, setSelectedDepotId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // Filter incidents needing supplies
  const pendingRequests = incidents.filter(
    (inc) => inc.status === 'PENDING' || inc.status === 'VERIFIED'
  );

  const selectedIncident = incidents.find((i) => i.incident_id === selectedIncidentId);
  const selectedDepot = depots.find((d) => d.depot_id === selectedDepotId);
  const availableVehicles = vehicles.filter((v) => v.status === 'AVAILABLE');

  const handleApproveAllocation = async () => {
    if (!selectedIncidentId || !selectedDepotId || !selectedVehicleId) {
      setErrorMsg('Please select an incident, a supply depot, and an available vehicle.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await allocateRelief({
        incident_id: selectedIncidentId,
        depot_id: selectedDepotId,
        vehicle_id: selectedVehicleId,
        food_units: selectedIncident?.food_needed || 10,
        water_units: selectedIncident?.water_needed || 20,
        shelter_units: selectedIncident?.shelter_needed || 1,
        medical_units: selectedIncident?.medical_needed || 1
      });

      setSuccessMsg('Allocation approved! Vehicle dispatched and depot inventory deducted.');
      setSelectedIncidentId('');
      setSelectedVehicleId('');
      if (onReloadData) onReloadData();
    } catch (err) {
      setErrorMsg(err.message || 'Allocation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white border border-tactical-border w-full max-w-4xl rounded-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#553a34] text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Truck className="w-5 h-5 text-rust" />
            <div>
              <h2 className="font-heading font-bold text-base uppercase tracking-wider">
                Rescue Link / Supply Command
              </h2>
              <p className="text-[11px] text-espresso-200 font-mono">
                Relief Operations & Forward Depots
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-espresso-300 hover:text-white p-1 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Section 1: Relief Depots Inventory */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-bold text-sm uppercase text-espresso tracking-wide">
                Two Relief Depots
              </h3>
              <span className="text-[11px] font-mono text-espresso-500">
                Stock automatically decreases upon dispatch approval
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {depots.map((depot) => (
                <div
                  key={depot.depot_id}
                  className={`p-4 rounded-sm border transition cursor-pointer ${
                    selectedDepotId === depot.depot_id
                      ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                      : 'border-tactical-border bg-parchment hover:border-espresso-400'
                  }`}
                  onClick={() => setSelectedDepotId(depot.depot_id)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-heading font-bold text-sm text-espresso">
                      {depot.name}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                      ACTIVE SECTOR
                    </span>
                  </div>
                  <p className="text-xs text-espresso-600 mb-3 font-mono">{depot.sector}</p>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-white p-2 rounded border border-tactical-border">
                      <div className="text-[10px] text-espresso-500 uppercase font-mono">Food</div>
                      <div className="font-mono font-bold text-sm text-espresso">{depot.food_units}</div>
                    </div>
                    <div className="bg-white p-2 rounded border border-tactical-border">
                      <div className="text-[10px] text-espresso-500 uppercase font-mono">Water</div>
                      <div className="font-mono font-bold text-sm text-espresso">{depot.water_units}L</div>
                    </div>
                    <div className="bg-white p-2 rounded border border-tactical-border">
                      <div className="text-[10px] text-espresso-500 uppercase font-mono">Shelter</div>
                      <div className="font-mono font-bold text-sm text-espresso">{depot.shelter_units}</div>
                    </div>
                    <div className="bg-white p-2 rounded border border-tactical-border">
                      <div className="text-[10px] text-espresso-500 uppercase font-mono">Medical</div>
                      <div className="font-mono font-bold text-sm text-espresso">{depot.medical_units}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Allocation & Dispatch Planner */}
          <div className="border-t border-tactical-border pt-4">
            <h3 className="font-heading font-bold text-sm uppercase text-espresso tracking-wide mb-3">
              Approve Allocation and Assign Vehicle
            </h3>

            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-sm flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-sm">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Step A: Select Incident needing supplies */}
              <div>
                <label className="block text-xs font-mono uppercase text-espresso-700 mb-1 font-bold">
                  1. Verified Request ({pendingRequests.length})
                </label>
                <select
                  value={selectedIncidentId}
                  onChange={(e) => setSelectedIncidentId(e.target.value)}
                  className="w-full p-2 text-xs bg-parchment rounded-sm border border-tactical-border text-espresso focus:border-espresso focus:outline-none"
                >
                  <option value="">-- Choose verified request --</option>
                  {pendingRequests.map((inc) => (
                    <option key={inc.incident_id} value={inc.incident_id}>
                      [{inc.category.toUpperCase()}] {inc.description.slice(0, 35)}...
                    </option>
                  ))}
                </select>
                {selectedIncident && (
                  <div className="mt-2 text-[11px] font-mono text-espresso-600 bg-parchment p-2 rounded border border-tactical-border">
                    Needs: {selectedIncident.food_needed} Food, {selectedIncident.water_needed}L Water, {selectedIncident.medical_needed} Meds
                  </div>
                )}
              </div>

              {/* Step B: Select Source Depot */}
              <div>
                <label className="block text-xs font-mono uppercase text-espresso-700 mb-1 font-bold">
                  2. Source Depot
                </label>
                <select
                  value={selectedDepotId}
                  onChange={(e) => setSelectedDepotId(e.target.value)}
                  className="w-full p-2 text-xs bg-parchment rounded-sm border border-tactical-border text-espresso focus:border-espresso focus:outline-none"
                >
                  <option value="">-- Choose relief depot --</option>
                  {depots.map((d) => (
                    <option key={d.depot_id} value={d.depot_id}>
                      {d.name} ({d.food_units} food / {d.water_units}L water)
                    </option>
                  ))}
                </select>
              </div>

              {/* Step C: Select Available Vehicle */}
              <div>
                <label className="block text-xs font-mono uppercase text-espresso-700 mb-1 font-bold">
                  3. Available Delivery Vehicle
                </label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full p-2 text-xs bg-parchment rounded-sm border border-tactical-border text-espresso focus:border-espresso focus:outline-none"
                >
                  <option value="">-- Select available vehicle --</option>
                  {availableVehicles.map((v) => (
                    <option key={v.vehicle_id} value={v.vehicle_id}>
                      {v.vehicle_number} ({v.vehicle_type})
                    </option>
                  ))}
                </select>
              </div>

            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleApproveAllocation}
                disabled={submitting || !selectedIncidentId || !selectedDepotId || !selectedVehicleId}
                className="px-6 py-2.5 bg-espresso hover:bg-espresso-800 disabled:opacity-50 text-white font-mono text-xs uppercase tracking-wider rounded-sm transition shadow flex items-center space-x-2"
              >
                <span>Approve Allocation and Assign Vehicle</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Section 3: Delivery Vehicles & Active Loads */}
          <div className="border-t border-tactical-border pt-4">
            <h3 className="font-heading font-bold text-sm uppercase text-espresso tracking-wide mb-3">
              Delivery Vehicles & Active Fleet
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {vehicles.map((veh) => (
                <div key={veh.vehicle_id} className="p-3 bg-parchment border border-tactical-border rounded-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-xs text-espresso">{veh.vehicle_number}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                      veh.status === 'AVAILABLE' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {veh.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-espresso-600">{veh.vehicle_type}</div>
                  <div className="text-[10px] font-mono text-espresso-500 mt-1">
                    GPS: {veh.current_lat.toFixed(3)}, {veh.current_lng.toFixed(3)}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
