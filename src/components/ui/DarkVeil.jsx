import React from 'react'

export default function DarkVeil({
  hueShift = 0,
  noiseIntensity = 0,
  scanlineIntensity = 0,
  speed = 0.5,
  scanlineFrequency = 0,
  warpAmount = 0,
  resolutionScale = 1
}) {
  const duration = Math.max(6, 20 / Math.max(speed, 0.1))
  const layerStyle = {
    position: 'absolute',
    inset: 0,
    background: `
      radial-gradient(80% 70% at 15% 20%, hsla(${220 + hueShift}, 90%, 55%, 0.28), transparent 65%),
      radial-gradient(65% 60% at 85% 80%, hsla(${180 + hueShift}, 95%, 50%, 0.22), transparent 65%),
      linear-gradient(135deg, #05070d 0%, #0a1020 45%, #050810 100%)
    `,
    backgroundSize: `${125 + warpAmount * 60}% ${125 + warpAmount * 60}%`,
    animation: `darkVeilDrift ${duration}s ease-in-out infinite`,
    transform: `scale(${Math.max(0.8, resolutionScale)})`,
    pointerEvents: 'none'
  }

  const noiseStyle = {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 0.5px, transparent 0.5px)',
    backgroundSize: '2px 2px',
    opacity: Math.min(0.14, Math.max(0, noiseIntensity * 0.14)),
    mixBlendMode: 'soft-light',
    pointerEvents: 'none'
  }

  const scanStyle = {
    position: 'absolute',
    inset: 0,
    backgroundImage: `repeating-linear-gradient(
      to bottom,
      rgba(255,255,255,${Math.min(0.18, Math.max(0, scanlineIntensity * 0.18))}) 0px,
      rgba(255,255,255,0) ${Math.max(1, scanlineFrequency || 1)}px,
      rgba(255,255,255,0) ${Math.max(3, (scanlineFrequency || 1) * 2)}px
    )`,
    pointerEvents: 'none'
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <style>
        {`
          @keyframes darkVeilDrift {
            0% { transform: translate3d(0%, 0%, 0) scale(1.05) rotate(0deg); filter: hue-rotate(0deg); }
            25% { transform: translate3d(-3%, 2%, 0) scale(1.08) rotate(0.8deg); filter: hue-rotate(6deg); }
            50% { transform: translate3d(2%, -2%, 0) scale(1.06) rotate(-0.8deg); filter: hue-rotate(12deg); }
            75% { transform: translate3d(-1%, 1%, 0) scale(1.09) rotate(0.4deg); filter: hue-rotate(6deg); }
            100% { transform: translate3d(0%, 0%, 0) scale(1.05) rotate(0deg); filter: hue-rotate(0deg); }
          }
        `}
      </style>
      <div style={layerStyle} />
      <div style={noiseStyle} />
      <div style={scanStyle} />
    </div>
  )
}
