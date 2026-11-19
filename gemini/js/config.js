(function (global) {
  'use strict';

  const VespaGame = (global.VespaGame = global.VespaGame || {});

  VespaGame.CONFIG = {
    ROAD_WIDTH: 9.2,
    LANE_OFFSET: 2.25,
    ROAD_SEGMENTS: 460,
    NUM_CONTROL_POINTS: 28,
    TUNNEL_START_T: 0.445,
    TUNNEL_END_T: 0.495,
    TRAFFIC_COUNT: 22,
    TOTAL_TOUR_LAPS: 2,
    MIN_SPEED: 9.5,
    CRUISE_SPEED: 14.8,
    MAX_SPEED: 22.5,
    MENU_SPEED: 10.5
  };

  VespaGame.VESPA_COLORS = [
    {
      id: 'mint',
      name: 'Vintage Mint',
      swatch: '#7fd8be',
      bodyHex: 0x7fd8be,
      saddleHex: 0x6b3b22,
      helmetHex: 0xf7efe0,
      scarfHex: 0xd9383a,
      minimapHex: '#7fd8be'
    },
    {
      id: 'rosso',
      name: 'Rosso Corsa',
      swatch: '#d62828',
      bodyHex: 0xd62828,
      saddleHex: 0x2b1d17,
      helmetHex: 0xf7f1e3,
      scarfHex: 0xffd166,
      minimapHex: '#ff595e'
    },
    {
      id: 'cream',
      name: 'Cream White',
      swatch: '#f4ebd9',
      bodyHex: 0xf4ebd9,
      saddleHex: 0x7a4424,
      helmetHex: 0x2d3a4b,
      scarfHex: 0xc93838,
      minimapHex: '#f4ebd9'
    },
    {
      id: 'alpine',
      name: 'Alpine Blue',
      swatch: '#3b78b8',
      bodyHex: 0x3b78b8,
      saddleHex: 0x6b3b22,
      helmetHex: 0xf7efe0,
      scarfHex: 0xff9f1c,
      minimapHex: '#64a6ed'
    }
  ];

  VespaGame.ATMOSPHERES = [
    {
      id: 'golden',
      name: 'Golden Hour',
      badge: 'Golden-Hour Alpine Pass',
      icon: '☀',
      sunDir: [-0.62, 0.24, -0.75],
      skyTop: 0x284378,
      skyMid: 0xc96b6e,
      skyHorizon: 0xffbe76,
      skySun: 0xfff5d6,
      fogColor: 0xe8a87c,
      fogDensity: 0.00162,
      hemiSky: 0xffd7a8,
      hemiGround: 0x3b4d3b,
      hemiIntensity: 0.78,
      sunColor: 0xffcb8c,
      sunIntensity: 1.95,
      exposure: 1.12,
      lakeColor: 0x3b6e8c,
      lakeEmissive: 0x261d24,
      lakeEmissiveIntensity: 0.26,
      cloudColor: 0xffe4cc,
      cloudOpacity: 0.84,
      dustColor: 0xffd7a8,
      dustOpacity: 0.42,
      headlightsOn: false,
      headlightIntensity: 0.0,
      vehicleHeadlightEmissive: 1.3,
      tunnelLightIntensity: 1.6,
      windowEmissiveIntensity: 0.35,
      starOpacity: 0.0,
      flareColor: 'rgba(255, 206, 130, 0.72)',
      flareStrength: 0.95
    },
    {
      id: 'morning',
      name: 'Alpine Morning',
      badge: 'Crisp Alpine Morning',
      icon: '⛰',
      sunDir: [0.46, 0.56, -0.68],
      skyTop: 0x1a65b8,
      skyMid: 0x6ab4e8,
      skyHorizon: 0xd9f0fc,
      skySun: 0xffffff,
      fogColor: 0xc6e2f5,
      fogDensity: 0.00112,
      hemiSky: 0xdaf1ff,
      hemiGround: 0x4b6e49,
      hemiIntensity: 0.96,
      sunColor: 0xfff8ea,
      sunIntensity: 2.18,
      exposure: 1.15,
      lakeColor: 0x2a82a8,
      lakeEmissive: 0x0d2638,
      lakeEmissiveIntensity: 0.18,
      cloudColor: 0xffffff,
      cloudOpacity: 0.9,
      dustColor: 0xeef5fa,
      dustOpacity: 0.32,
      headlightsOn: false,
      headlightIntensity: 0.0,
      vehicleHeadlightEmissive: 0.95,
      tunnelLightIntensity: 2.0,
      windowEmissiveIntensity: 0.08,
      starOpacity: 0.0,
      flareColor: 'rgba(235, 248, 255, 0.65)',
      flareStrength: 0.78
    },
    {
      id: 'twilight',
      name: 'Twilight',
      badge: 'Alpine Twilight Cruise',
      icon: '☽',
      sunDir: [-0.72, 0.09, -0.68],
      skyTop: 0x0a1026,
      skyMid: 0x2b2552,
      skyHorizon: 0xa65363,
      skySun: 0xff9f7a,
      fogColor: 0x1b1e36,
      fogDensity: 0.00205,
      hemiSky: 0x6272b0,
      hemiGround: 0x1e2536,
      hemiIntensity: 0.72,
      sunColor: 0xaabcf0,
      sunIntensity: 0.76,
      exposure: 1.1,
      lakeColor: 0x192b47,
      lakeEmissive: 0x18132c,
      lakeEmissiveIntensity: 0.35,
      cloudColor: 0x6a587a,
      cloudOpacity: 0.62,
      dustColor: 0x8ea0c4,
      dustOpacity: 0.24,
      headlightsOn: true,
      headlightIntensity: 4.8,
      vehicleHeadlightEmissive: 2.8,
      tunnelLightIntensity: 3.4,
      windowEmissiveIntensity: 1.85,
      starOpacity: 0.88,
      flareColor: 'rgba(255, 146, 118, 0.52)',
      flareStrength: 0.45
    }
  ];

  VespaGame.getColorPreset = function (id) {
    return VespaGame.VESPA_COLORS.find(c => c.id === id) || VespaGame.VESPA_COLORS[0];
  };

  VespaGame.getAtmospherePreset = function (id) {
    return VespaGame.ATMOSPHERES.find(a => a.id === id) || VespaGame.ATMOSPHERES[0];
  };
})(window);
