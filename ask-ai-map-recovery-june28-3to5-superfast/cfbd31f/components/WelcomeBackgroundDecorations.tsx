function WelcomeBackgroundDecorations() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[var(--bg)]" />

      <svg
        viewBox="0 0 390 844"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full opacity-70"
      >
        <g opacity="0.12" className="welcome-skyline">
          <path
            d="M0 662H22V636H36V604H54V626H71V592H95V642H114V618H131V584H150V634H171V610H193V564H213V646H232V622H249V596H271V636H290V574H312V620H332V600H348V628H366V612H380V646H390V844H0Z"
            fill="#1E3A8A"
          />
        </g>

        <rect x="0" y="724" width="390" height="120" fill="#DBEAFE" opacity="0.22" className="welcome-base-block" />
      </svg>
    </div>
  )
}

export default WelcomeBackgroundDecorations
