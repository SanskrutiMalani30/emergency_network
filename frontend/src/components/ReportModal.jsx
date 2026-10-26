import React, { useState, useEffect } from 'react';
import { X, Camera, MapPin, AlertCircle, CheckCircle, Sparkles, ArrowRight, ArrowLeft } from 'lucide-react';
import { assessCrisisAI, createIncident } from '../services/api';

export default function ReportModal({ isOpen, onClose, onCreated, defaultCoords }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [evaluatingAI, setEvaluatingAI] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Form Fields
  const [category, setCategory] = useState('flood');
  const [description, setDescription] = useState('');
  const [peopleAffected, setPeopleAffected] = useState(4);
  const [phone, setPhone] = useState('+91 98765 43210');
  const [lat, setLat] = useState(defaultCoords?.lat || 21.1458);
  const [lng, setLng] = useState(defaultCoords?.lng || 79.0882);

  // Supply Needs
  const [needFood, setNeedFood] = useState(true);
  const [needWater, setNeedWater] = useState(true);
  const [needShelter, setNeedShelter] = useState(false);
  const [needMedical, setNeedMedical] = useState(false);

  // AI Assessment State
  const [aiResult, setAiResult] = useState(null);

  useEffect(() => {
    if (defaultCoords) {
      setLat(defaultCoords.lat);
      setLng(defaultCoords.lng);
    }
  }, [defaultCoords]);

  if (!isOpen) return null;

  // Run AI Triage Assessment before step 2
  const handleProceedToStep2 = async () => {
    if (description.trim().length < 5) {
      setErrorMessage('Please provide a descriptive account of the emergency situation.');
      return;
    }
    setErrorMessage('');
    setEvaluatingAI(true);

    try {
      const assessment = await assessCrisisAI({
        category,
        description,
        people_affected: peopleAffected,
        has_image: false
      });
      setAiResult(assessment);
      setStep(2);
    } catch (err) {
      console.warn('AI Triage error:', err);
      setStep(2);
    } finally {
      setEvaluatingAI(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setErrorMessage('');

    const payload = {
      category,
      description,
      severity: aiResult?.severity || 'Medium',
      urgency: aiResult?.urgency_score || 6,
      people_affected: peopleAffected,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      reporter_phone: phone,
      food_needed: needFood ? (aiResult?.recommended_food || peopleAffected * 2) : 0,
      water_needed: needWater ? (aiResult?.recommended_water || peopleAffected * 4) : 0,
      shelter_needed: needShelter ? (aiResult?.recommended_shelter || 1) : 0,
      medical_needed: needMedical ? (aiResult?.recommended_medical || 1) : 0,
      ai_assessment: aiResult ? `${aiResult.severity} ${category.toUpperCase()}` : null,
      ai_reason: aiResult?.ai_reason || null,
      ai_confidence: aiResult?.confidence || 0.85
    };

    try {
      const newInc = await createIncident(payload);
      setSubmitted(true);
      if (onCreated) onCreated(newInc);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit incident report');
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setStep(1);
    setSubmitted(false);
    setDescription('');
    setAiResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white border border-tactical-border w-full max-w-lg rounded-sm shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#553a34] text-white flex items-center justify-between">
          <div>
            <h2 className="font-heading font-bold text-base uppercase tracking-wider">
              Report Incident & Request Relief
            </h2>
            <p className="text-[11px] text-espresso-200 font-mono">
              Step {step} of 2 · Tactical Dispatch Network
            </p>
          </div>
          <button
            onClick={handleResetAndClose}
            className="text-espresso-300 hover:text-white p-1 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          
          {submitted ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h3 className="font-heading font-bold text-lg text-espresso uppercase">
                REPORT SUBMITTED
              </h3>
              <p className="text-xs text-espresso-600 max-w-sm mx-auto">
                Your signal has been registered into the ScyllaDB low-latency cluster. Dispatchers and forward depots have been notified.
              </p>
              <button
                onClick={handleResetAndClose}
                className="mt-4 px-6 py-2 bg-espresso hover:bg-espresso-800 text-white font-mono text-xs uppercase tracking-wider rounded-sm transition shadow"
              >
                Return to Dashboard
              </button>
            </div>
          ) : step === 1 ? (
            <div className="space-y-4">
              {/* Category Selector */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-espresso-700 mb-1.5 font-bold">
                  Crisis Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['flood', 'fire', 'medical', 'structural', 'supplies', 'other'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`py-2 px-3 text-xs uppercase font-mono rounded-sm border transition ${
                        category === cat
                          ? 'bg-espresso text-white border-espresso shadow-sm'
                          : 'bg-parchment text-espresso-700 border-tactical-border hover:bg-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-espresso-700 mb-1 font-bold">
                  Situation Details
                </label>
                <p className="text-[11px] text-espresso-500 mb-1.5">
                  Describe what is happening, trapped persons, or immediate hazards. AI will evaluate priority and relief quotas.
                </p>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Flash flooding in Sector 4; 8 residents stranded on building rooftop, water rising fast..."
                  className="w-full p-2.5 text-xs bg-parchment rounded-sm border border-tactical-border focus:border-espresso text-espresso focus:outline-none"
                />
              </div>

              {/* People count & Contact */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-mono uppercase text-espresso-700 mb-1 font-bold">
                    People Needing Aid
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setPeopleAffected(Math.max(1, peopleAffected - 1))}
                      className="w-8 h-8 bg-parchment border border-tactical-border text-espresso font-bold rounded-sm hover:bg-white"
                    >
                      -
                    </button>
                    <span className="font-mono text-sm font-bold text-espresso px-2">
                      {peopleAffected}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPeopleAffected(peopleAffected + 1)}
                      className="w-8 h-8 bg-parchment border border-tactical-border text-espresso font-bold rounded-sm hover:bg-white"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-espresso-700 mb-1 font-bold">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full p-2 text-xs bg-parchment rounded-sm border border-tactical-border focus:border-espresso text-espresso focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Supply Requirements */}
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-espresso-700 mb-2 font-bold">
                  Immediate Supplies Required
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center space-x-2 bg-parchment p-2 rounded-sm border border-tactical-border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needFood}
                      onChange={(e) => setNeedFood(e.target.checked)}
                      className="rounded text-espresso"
                    />
                    <span>Dry Food Rations</span>
                  </label>
                  <label className="flex items-center space-x-2 bg-parchment p-2 rounded-sm border border-tactical-border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needWater}
                      onChange={(e) => setNeedWater(e.target.checked)}
                      className="rounded text-espresso"
                    />
                    <span>Clean Water (Liters)</span>
                  </label>
                  <label className="flex items-center space-x-2 bg-parchment p-2 rounded-sm border border-tactical-border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needShelter}
                      onChange={(e) => setNeedShelter(e.target.checked)}
                      className="rounded text-espresso"
                    />
                    <span>Shelter / Tarps</span>
                  </label>
                  <label className="flex items-center space-x-2 bg-parchment p-2 rounded-sm border border-tactical-border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={needMedical}
                      onChange={(e) => setNeedMedical(e.target.checked)}
                      className="rounded text-espresso"
                    />
                    <span>Trauma / Medical Kits</span>
                  </label>
                </div>
              </div>

              {errorMessage && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-sm flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Step 1 Actions */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleProceedToStep2}
                  disabled={evaluatingAI}
                  className="px-5 py-2.5 bg-espresso hover:bg-espresso-800 text-white font-mono text-xs uppercase tracking-wider rounded-sm flex items-center space-x-2 transition shadow"
                >
                  {evaluatingAI ? (
                    <span>Running AI Triage...</span>
                  ) : (
                    <>
                      <span>Next: Verify & AI Triage</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Step 2: Verification, Media & AI Triage Preview */
            <div className="space-y-4">
              
              {/* AI Triage Card */}
              {aiResult && (
                <div className="bg-espresso-50/80 border border-espresso-200 p-4 rounded-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-espresso">
                      <Sparkles className="w-4 h-4 text-rust" />
                      <span className="font-heading font-bold text-xs uppercase tracking-wider">
                        AI Crisis Triage Assessment
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-espresso-600 bg-white px-2 py-0.5 rounded border border-espresso-200">
                      {Math.round(aiResult.confidence * 100)}% Confidence
                    </span>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="bg-white p-2 rounded-sm border border-espresso-200 text-center min-w-[70px]">
                      <div className="text-[10px] font-mono uppercase text-espresso-500">Urgency</div>
                      <div className="text-xl font-bold font-heading text-rust">
                        {aiResult.urgency_score}/10
                      </div>
                    </div>
                    <div className="flex-1 text-xs text-espresso-800 leading-relaxed">
                      {aiResult.ai_reason}
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-espresso-600 pt-1 border-t border-espresso-200/60">
                    Recommended Units: Food {aiResult.recommended_food} | Water {aiResult.recommended_water}L | Shelter {aiResult.recommended_shelter}
                  </div>
                </div>
              )}

              {/* Coordinates Confirmation */}
              <div>
                <label className="block text-xs font-mono uppercase text-espresso-700 mb-1 font-bold">
                  Location Coordinates
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center space-x-1 bg-parchment p-2 rounded-sm border border-tactical-border text-xs font-mono">
                    <MapPin className="w-3.5 h-3.5 text-rust shrink-0" />
                    <span>LAT: {parseFloat(lat).toFixed(4)}</span>
                  </div>
                  <div className="flex items-center space-x-1 bg-parchment p-2 rounded-sm border border-tactical-border text-xs font-mono">
                    <MapPin className="w-3.5 h-3.5 text-rust shrink-0" />
                    <span>LNG: {parseFloat(lng).toFixed(4)}</span>
                  </div>
                </div>
              </div>

              {/* Simulated Media Capture */}
              <div>
                <label className="block text-xs font-mono uppercase text-espresso-700 mb-1 font-bold">
                  Visual Evidence (Optional)
                </label>
                <div className="border border-dashed border-tactical-borderDark p-4 text-center rounded-sm bg-parchment">
                  <Camera className="w-6 h-6 text-espresso-400 mx-auto mb-1.5" />
                  <p className="text-xs text-espresso-700 font-medium">Capture Photo or Record Video</p>
                  <p className="text-[10px] text-espresso-500">Supports damage classification and OCR signposts</p>
                </div>
              </div>

              {errorMessage && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-sm">
                  {errorMessage}
                </div>
              )}

              {/* Step 2 Actions */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-tactical-border hover:bg-parchment text-espresso text-xs font-mono uppercase rounded-sm flex items-center space-x-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white font-mono text-xs uppercase font-bold tracking-wider rounded-sm shadow-md transition"
                >
                  {loading ? 'Transmitting Signal...' : 'CONFIRM & DISPATCH'}
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
