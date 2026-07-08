interface MdiIconProps {
  path: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

export default function MdiIcon({ path, size = 24, color = 'currentColor', style }: MdiIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ verticalAlign: 'middle', ...style }}
    >
      <path d={path} fill={color} />
    </svg>
  );
}
