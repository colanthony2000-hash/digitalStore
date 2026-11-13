import { useState } from 'react';
import {
  BookOpenCheck,
  BrainCircuit,
  BriefcaseBusiness,
  ClipboardCheck,
  GraduationCap,
  Layers,
  Megaphone,
  MonitorCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';

interface EcosystemIconProps {
  iconName?: string | null;
  logoUrl?: string | null;
  name: string;
  className?: string;
}

const ICON_MAP = {
  GraduationCap,
  BrainCircuit,
  BookOpenCheck,
  MonitorCheck,
  BriefcaseBusiness,
  Wallet,
  ClipboardCheck,
  Megaphone,
  Sparkles,
  Layers,
} as const;

export function EcosystemIcon({
  iconName,
  logoUrl,
  name,
  className = 'w-5 h-5',
}: EcosystemIconProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (logoUrl && !imgFailed) {
    return (
      <img
        src={logoUrl}
        alt={`${name} icon`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${className} object-contain`}
      />
    );
  }

  const IconComponent =
    ICON_MAP[(iconName as keyof typeof ICON_MAP) || 'Layers'] || Layers;

  return <IconComponent className={className} strokeWidth={1.6} />;
}
