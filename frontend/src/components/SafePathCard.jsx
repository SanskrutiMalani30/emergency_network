import React, { useState } from 'react';
import {
  Shield,
  Globe,
  AlertTriangle,
  Navigation,
  Phone,
  HeartPulse,
  MapPin,
  ChevronRight,
  SlidersHorizontal,
  X,
  Check,
  ExternalLink,
  Map
} from 'lucide-react';

const TRANSLATIONS = {
  EN: {
    appName: 'SafePath',
    warningTitle: 'Warning in your area',
    warningSub: 'Follow official evacuation instructions.',
    heading: 'Find a safe place',
    subheading: 'Choose an option to get help.',
    primaryLabel: 'FIND SAFETY',
    primarySub: 'Find verified shelters and safe routes',
    callLabel: 'Call for help',
    callSub: 'Emergency contacts',
    medLabel: 'Medical help',
    medSub: 'Urgent medical aid',
    yourLocation: 'Your location',
    locNeeded: 'Location access needed to find nearby help',
    moreOptions: 'More options',
    currentGps: 'Current GPS location active',
    lastKnown: 'Last known location',
    meters: 'm'
  },
  HI: {
    appName: 'SafePath',
    warningTitle: 'आपके क्षेत्र में चेतावनी',
    warningSub: 'आधिकारिक निकासी निर्देशों का पालन करें।',
    heading: 'सुरक्षित स्थान खोजें',
    subheading: 'मदद पाने के लिए एक विकल्प चुनें।',
    primaryLabel: 'सुरक्षा खोजें',
    primarySub: 'सत्यापित आश्रय स्थल और सुरक्षित मार्ग खोजें',
    callLabel: 'मदद के लिए कॉल करें',
    callSub: 'आपातकालीन संपर्क',
    medLabel: 'चिकित्सा सहायता',
    medSub: 'त्वरित देखभाल का अनुरोध करें',
    yourLocation: 'आपका स्थान',
    locNeeded: 'पास में मदद खोजने के लिए स्थान की अनुमति आवश्यक है',
    moreOptions: 'अधिक विकल्प',
    currentGps: 'वर्तमान जीपीएस सक्रिय',
    lastKnown: 'अंतिम ज्ञात स्थान',
    meters: 'मी'
  },
  MR: {
    appName: 'SafePath',
    warningTitle: 'तुमच्या परिसरात धोक्याची सूचना',
    warningSub: 'अधिकृत स्थलांतर सूचनांचे पालन करा.',
    heading: 'सुरक्षित जागा शोधा',
    subheading: 'मदत मिळवण्यासाठी एक पर्याय निवडा.',
    primaryLabel: 'सुरक्षा शोधा',
    primarySub: 'सत्यापित निवारे आणि सुरक्षित मार्ग शोधा',
    callLabel: 'मदतीसाठी कॉल करा',
    callSub: 'आपत्कालीन संपर्क',
    medLabel: 'वैद्यकीय मदत',
    medSub: 'तातडीची वैद्यकीय मदत मागा',
    yourLocation: 'तुमचे स्थान',
    locNeeded: 'जवळची मदत शोधण्यासाठी स्थान प्रवेश आवश्यक आहे',
    moreOptions: 'अधिक पर्याय',
    currentGps: 'सध्याचा GPS सक्रिय',
    lastKnown: 'शेवटचे ज्ञात स्थान',
    meters: 'मी'
  },
  ES: {
    appName: 'SafePath',
    warningTitle: 'Alerta en su zona',
    warningSub: 'Siga las instrucciones oficiales de evacuación.',
    heading: 'Encuentre un lugar seguro',
    subheading: 'Elija una opción para recibir ayuda.',
    primaryLabel: 'BUSCAR SEGURIDAD',
    primarySub: 'Buscar refugios verificados y rutas seguras',
    callLabel: 'Pedir ayuda',
    callSub: 'Contactos de emergencia',
    medLabel: 'Ayuda médica',
    medSub: 'Atención médica urgente',
    yourLocation: 'Su ubicación',
    locNeeded: 'Se necesita acceso a la ubicación para encontrar ayuda',
    moreOptions: 'Más opciones',
    currentGps: 'GPS actual activo',
    lastKnown: 'Última ubicación conocida',
    meters: 'm'
  }
};

const SUPPORTED_LANGUAGES = [
  { code: 'EN', label: 'English' },
  { code: 'HI', label: 'हिंदी (Hindi)' },
  { code: 'MR', label: 'मराठी (Marathi)' },
  { code: 'ES', label: 'Español' }
];

export default function SafePathCard({
  userLocation,
  onRequestUserLocation,
  hasActiveWarning = false,
  warningMessage = null,
  onFindSafety,
  onCallForHelp,
  onMedicalHelp,
  onOpenMoreOptions,
  onDiscreetTap
}) {
  const [currentLang, setCurrentLang] = useState('EN');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.EN;

  // Compute location display status
  const hasValidCoords = userLocation?.coords &&
    userLocation.coords.lat != null &&
    userLocation.coords.lng != null &&
    isFinite(Number(userLocation.coords.lat)) &&
    isFinite(Number(userLocation.coords.lng));

  const isGranted = userLocation?.status === 'granted' && hasValidCoords;
  const isRealGps = Boolean(userLocation?.isRealGps);

  let locationStatusText = t.locNeeded;
  if (isGranted) {
    const latStr = Number(userLocation.coords.lat).toFixed(4);
    const lngStr = Number(userLocation.coords.lng).toFixed(4);
    const acc = userLocation.coords.accuracy ? ` (±${Math.round(userLocation.coords.accuracy)}${t.meters})` : '';

    if (isRealGps) {
      locationStatusText = `${t.currentGps}: ${latStr}, ${lngStr}${acc}`;
    } else {
      locationStatusText = `${t.lastKnown}: ${latStr}, ${lngStr}${acc}`;
    }
  }

  return (
    <div className="w-full max-w-[480px] mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6 select-none relative font-sans text-slate-900">
      
      {/* 1. Header: app name/logo ("SafePath") with shield icon on left, and language selector on right */}
      <header className="flex items-center justify-between pb-4 border-b border-slate-100">
        <button
          type="button"
          onClick={onDiscreetTap}
          className="flex items-center space-x-2.5 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6B57] rounded-lg p-1 -ml-1 transition"
          title="SafePath Emergency Network (Click for quick emergency trigger)"
          aria-label="SafePath Home Logo"
        >
          <div className="w-9 h-9 rounded-xl bg-[#1B6B57]/10 flex items-center justify-center text-[#1B6B57] group-active:scale-95 transition">
            <Shield className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <span className="font-heading font-black text-xl tracking-tight text-slate-900">
            {t.appName}
          </span>
        </button>

        {/* Language selector: globe icon + code */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsLangMenuOpen(prev => !prev)}
            aria-expanded={isLangMenuOpen}
            aria-haspopup="listbox"
            aria-label="Select language"
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition text-xs font-bold text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6B57]"
          >
            <Globe className="w-4 h-4 text-slate-600" />
            <span>{currentLang}</span>
          </button>

          {isLangMenuOpen && (
            <div
              role="listbox"
              className="absolute right-0 mt-1.5 w-36 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden"
            >
              {SUPPORTED_LANGUAGES.map(lang => (
                <button
                  key={lang.code}
                  role="option"
                  aria-selected={currentLang === lang.code}
                  onClick={() => {
                    setCurrentLang(lang.code);
                    setIsLangMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs font-medium flex items-center justify-between transition ${
                    currentLang === lang.code
                      ? 'bg-[#1B6B57]/10 text-[#1B6B57] font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{lang.label}</span>
                  {currentLang === lang.code && <Check className="w-3.5 h-3.5 text-[#1B6B57]" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* 2. Alert banner (only shown when there is an active warning for the user's area) */}
      {hasActiveWarning && (
        <section
          aria-live="polite"
          className="mt-4 p-3.5 bg-[#FDEDE5] border border-[#F5C2B5] rounded-xl flex items-start space-x-3 text-[#991B1B]"
        >
          <div className="shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5 text-[#991B1B]" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm leading-tight text-[#991B1B]">
              {warningMessage?.title || t.warningTitle}
            </h4>
            <p className="text-xs text-[#7F1D1D] mt-0.5 leading-normal">
              {warningMessage?.body || t.warningSub}
            </p>
          </div>
        </section>
      )}

      {/* 3. Section heading: "Find a safe place" with one-line subtext */}
      <div className="mt-5 mb-4 text-left">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-snug">
          {t.heading}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {t.subheading}
        </p>
      </div>

      {/* 4. PRIMARY BUTTON: full width, very large (about 130px tall), dark green background, white text */}
      <button
        type="button"
        onClick={onFindSafety}
        aria-label={`${t.primaryLabel} — ${t.primarySub}`}
        className="w-full min-h-[130px] h-[130px] bg-[#1B6B57] hover:bg-[#165646] active:bg-[#12483A] text-white rounded-2xl p-4 flex flex-col items-center justify-center text-center shadow-md active:scale-[0.99] transition duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1B6B57]/40 cursor-pointer"
      >
        <Navigation className="w-8 h-8 mb-1.5 text-white" strokeWidth={2.4} />
        <span className="text-2xl font-black tracking-wide leading-tight uppercase font-heading">
          {t.primaryLabel}
        </span>
        <span className="text-xs sm:text-sm text-emerald-100/90 font-medium mt-1 leading-snug max-w-xs">
          {t.primarySub}
        </span>
      </button>

      {/* 5. SECONDARY BUTTONS: two equal-width buttons side by side below the primary */}
      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        
        {/* Button 1: Call for help (phone icon) */}
        <button
          type="button"
          onClick={onCallForHelp}
          aria-label={t.callLabel}
          className="min-h-[72px] bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6B57] cursor-pointer"
        >
          <Phone className="w-5 h-5 text-slate-700 mb-1" strokeWidth={2} />
          <span className="text-sm font-bold text-slate-800 leading-tight">
            {t.callLabel}
          </span>
        </button>

        {/* Button 2: Medical help (heart-pulse icon) */}
        <button
          type="button"
          onClick={onMedicalHelp}
          aria-label={t.medLabel}
          className="min-h-[72px] bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100 rounded-xl p-3 flex flex-col items-center justify-center text-center shadow-xs active:scale-[0.98] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6B57] cursor-pointer"
        >
          <HeartPulse className="w-5 h-5 text-slate-700 mb-1" strokeWidth={2} />
          <span className="text-sm font-bold text-slate-800 leading-tight">
            {t.medLabel}
          </span>
        </button>

      </div>

      {/* 6. Location row at the bottom: pin icon, "Your location" in bold, and short status line */}
      <button
        type="button"
        onClick={onRequestUserLocation}
        aria-label={`${t.yourLocation}: ${locationStatusText}. Tap to update location.`}
        className="w-full mt-4 p-3 bg-slate-50 hover:bg-slate-100 active:bg-slate-200/80 border border-slate-200/80 rounded-xl flex items-center space-x-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6B57] cursor-pointer"
      >
        <div className={`p-1.5 rounded-lg shrink-0 ${isGranted ? 'bg-[#1B6B57]/10 text-[#1B6B57]' : 'bg-slate-200 text-slate-600'}`}>
          <MapPin className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-xs text-slate-800 flex items-center space-x-1.5">
            <span>{t.yourLocation}</span>
            {isGranted && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#1B6B57]" />
            )}
          </div>
          <p className="text-[11px] text-slate-500 truncate leading-snug">
            {locationStatusText}
          </p>
        </div>
        <span className="text-[10px] font-bold text-[#1B6B57] shrink-0 hover:underline">
          {isGranted ? 'Update' : 'Enable'}
        </span>
      </button>

      {/* 7. More options link / bottom menu trigger */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onOpenMoreOptions}
          aria-label={t.moreOptions}
          className="flex items-center space-x-1.5 font-bold text-slate-600 hover:text-[#1B6B57] active:text-[#165646] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6B57] rounded-md px-1 py-0.5"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>{t.moreOptions}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <span className="text-[11px] text-slate-400 font-sans">
          SafePath Network
        </span>
      </div>

    </div>
  );
}
