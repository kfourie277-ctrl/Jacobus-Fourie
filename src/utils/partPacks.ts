export interface PackPart {
  name: string;
  quantity: number;
  price: number;
  description: string;
}

export interface PartPack {
  id: string;
  name: string;
  category: "Engine" | "Brakes" | "Suspension" | "Performance" | "Cooling";
  description: string;
  parts: PackPart[];
}

export const PART_PACKS: PartPack[] = [
  {
    id: "turbo-replacement",
    name: "Turbocharger & Spares Replacement Pack",
    category: "Engine",
    description: "Complete assembly kit for replacing worn turbocharger units, including upgraded heavy-duty seals, copper split pins, gaskets, and essential engine oil flush accessories.",
    parts: [
      {
        name: "Upgraded Turbocharger Unit (Dual Ball-Bearing)",
        quantity: 1,
        price: 14500,
        description: "Heavy duty dual ball bearing core with billet compressor wheel for rapid spool."
      },
      {
        name: "Braided Stainless Steel Oil Feed Line",
        quantity: 1,
        price: 950,
        description: "Replaces original solid tubing to prevent thermal fatigue and carbon oil clogging."
      },
      {
        name: "High-Temp Multi-Layer Steel Exhaust Manifold Gasket",
        quantity: 1,
        price: 320,
        description: "Premium copper coated steel gaskets to guarantee positive leakage clearance."
      },
      {
        name: "Turbine Downpipe Flange Gasket",
        quantity: 1,
        price: 180,
        description: "Exhaust flange fire ring style gasket."
      },
      {
        name: "Heavy Duty Turbo Stud Kit (M10 High Tensile)",
        quantity: 1,
        price: 450,
        description: "High tension stud bolts with self-locking copper nuts."
      },
      {
        name: "Premium Synthetic Engine Oil (10W-60 Auto)",
        quantity: 1,
        price: 850,
        description: "High thermal stability synthetic oil recommended post-turbo swaps."
      },
      {
        name: "High Efficiency Bypass Oil Filter",
        quantity: 1,
        price: 190,
        description: "Engine oil filter canister."
      }
    ]
  },
  {
    id: "major-service",
    name: "Major Service Premium Refresh Kit",
    category: "Engine",
    description: "Standard top-tier comprehensive 60k/90k mileage interval service kit. Features high-flow filtration components and high-discharge iridium ignition parts.",
    parts: [
      {
        name: "Laser Iridium Spark Plugs (Set of 4)",
        quantity: 1,
        price: 980,
        description: "Double iridium tipped spark plugs for clean ignition discharge."
      },
      {
        name: "Pleated High Flow Active Carbon Cabin Air Filter",
        quantity: 1,
        price: 280,
        description: "Combats particulate matter and filters climate control cabin intake."
      },
      {
        name: "Multi-layered Engine Air Intake Filter Element",
        quantity: 1,
        price: 350,
        description: "High flow mesh dry element."
      },
      {
        name: "In-line High-Pressure Fuel Filter",
        quantity: 1,
        price: 420,
        description: "Filters tank sediment and safeguards fuel injectors from micro-particles."
      },
      {
        name: "Full Synthetic engine lubricant (5W-30 Premium)",
        quantity: 1,
        price: 750,
        description: "Low-viscosity high fuel efficiency protection blend."
      },
      {
        name: "Magnetic Sump Plug Replacement & Seal Washer",
        quantity: 1,
        price: 120,
        description: "Traps micro iron particles within sump fluid rotation."
      }
    ]
  },
  {
    id: "brake-overhaul",
    name: "High-Performance Ceramic Brake Overhaul Pack",
    category: "Brakes",
    description: "Premium replacement kit for complete front & rear axle brake rebuild. Outfitted with heavy-friction carbon mineral pads and alloy dynamic rotors.",
    parts: [
      {
        name: "Performance Vent Slotted Rotors - Front Pair",
        quantity: 1,
        price: 4200,
        description: "Cross-drilled heat-treated high carbon brake rotors."
      },
      {
        name: "Low-Dust Premium Ceramic Brake Pads - Front Axle",
        quantity: 1,
        price: 1250,
        description: "High coefficient friction compounds with anti-shriek shims."
      },
      {
        name: "Performance Heavy Duty Rotors - Rear Pair",
        quantity: 1,
        price: 2900,
        description: "Solid high carbon heat-treated brake rotors."
      },
      {
        name: "Premium Ceramic Brake Pads - Rear Axle Set",
        quantity: 1,
        price: 950,
        description: "Long-wear rear brake pads matching rotor alloy composition."
      },
      {
        name: "DOT 5.1 High-Boiling Hydraulic Brake Fluid (1L)",
        quantity: 1,
        price: 280,
        description: "Prevents vapor lock on high operational temperatures."
      }
    ]
  },
  {
    id: "suspension-overhaul",
    name: "Complete Front Polyurethane Suspension Kit",
    category: "Suspension",
    description: "Axle component restoration pack to fix front-end steering knock, loose feedback, and restore structural rigidity.",
    parts: [
      {
        name: "OES Strut Assembly Gas-Charged Shocks (Left & Right)",
        quantity: 1,
        price: 5200,
        description: "Monotube gas pressurized damper system."
      },
      {
        name: "Heavy Duty Control Arms with Polyurethane Bushings",
        quantity: 2,
        price: 3600,
        description: "Premium replacement wishbones pre-pressed with polyurethane sleeves for exact alignment preservation."
      },
      {
        name: "Spherical Outer Steering Tie Rod Ends (Left/Right Pair)",
        quantity: 1,
        price: 850,
        description: "Eliminates steering wheel dead-zone wobble."
      },
      {
        name: "Reinforced Sway Bar End Links - Front Axle Set",
        quantity: 1,
        price: 590,
        description: "Maintains optimal torsion control during lateral loads."
      }
    ]
  },
  {
    id: "cooling-refresh",
    name: "Thermodynamic Cooling Circuit Refresh Pack",
    category: "Cooling",
    description: "Designed for high-mileage cooling maintenance. Safeguards against thermal blowout and radiator head-tank cracks.",
    parts: [
      {
        name: "Alloy Core Reinforced Fluid Radiator Unit",
        quantity: 1,
        price: 2800,
        description: "High-density thermal dissipation core replacing fragile plastic composite tanks."
      },
      {
        name: "High-Volume Billet Impeller Water Pump",
        quantity: 1,
        price: 1450,
        description: "Pre-assembled with premium gasket to boost flow rates at low idle RPMs."
      },
      {
        name: "Low-Temp Thermostat (82 Degree Opening Valve)",
        quantity: 1,
        price: 450,
        description: "Maintains block water temperatures at lower operational equilibrium."
      },
      {
        name: "Spec Grade Radiator Coolant Fluid Premium Concentrate",
        quantity: 2,
        price: 360,
        description: "Contains organic rust inhibitors and provides sub-zero anti-freeze properties."
      },
      {
        name: "Silicon Radiator Coolant Hose Routing Kit Set",
        quantity: 1,
        price: 1100,
        description: "Multi-ply polyester reinforced silicone hoses."
      }
    ]
  },
  {
    id: "stage-1-tuning",
    name: "Stage 1 ECU Power & Ignition Upgrade Pack",
    category: "Performance",
    description: "Ignition system upgrade paired with custom recalibrated digital powertrain software to boost torque throughput safely.",
    parts: [
      {
        name: "Stage 1 Recalibrated Engine Software (License)",
        quantity: 1,
        price: 6500,
        description: "Slight boost profile bump + fuel timing maps optimization."
      },
      {
        name: "Direct Igniter Smart Coil Packs (Red R8 Type, Set of 4)",
        quantity: 1,
        price: 2400,
        description: "High secondary output voltage coil packs to resolve power spark blow-outs."
      },
      {
        name: "Unobstructed Dynamic Air Intake Induction System",
        quantity: 1,
        price: 3200,
        description: "Shielded dry filter pod with high-volume aluminum velocity inlet pipe."
      }
    ]
  }
];
