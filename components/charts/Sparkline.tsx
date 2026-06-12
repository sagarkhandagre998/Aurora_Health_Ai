/**
 * Sparkline — compact trend line for the monthly report.
 *
 * react-native-svg polyline (same lightweight SVG approach as MacroDonut).
 * Renders an optional soft fill under the line. Scales the series to fit the
 * given width/height; a flat/empty series renders a centred baseline.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Polyline, Polygon, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

export interface SparklineProps {
  points: number[];
  color: string;
  width?: number;
  height?: number;
  /** Draw a faded gradient fill under the line. Default true. */
  fill?: boolean;
  strokeWidth?: number;
}

export function Sparkline({
  points,
  color,
  width = 120,
  height = 40,
  fill = true,
  strokeWidth = 2,
}: SparklineProps) {
  const uid = React.useId().replace(/:/g, '');
  const gradId = `spark${uid}`;

  const { line, area, lastXY } = useMemo(() => {
    const n = points.length;
    const pad = strokeWidth + 1;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;

    if (n === 0) {
      const y = (height / 2).toFixed(1);
      return { line: `${pad},${y} ${width - pad},${y}`, area: '', lastXY: null };
    }

    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;

    const xy = points.map((v, i) => {
      const x = n === 1 ? width / 2 : pad + (i / (n - 1)) * innerW;
      const y = pad + (1 - (v - min) / span) * innerH;
      return [x, y] as const;
    });

    const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
    return { line, area, lastXY: xy[xy.length - 1] };
  }, [points, width, height, strokeWidth]);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {fill && area !== '' && <Polygon points={area} fill={`url(#${gradId})`} />}
        <Polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {lastXY && <Circle cx={lastXY[0]} cy={lastXY[1]} r={strokeWidth + 1} fill={color} />}
      </Svg>
    </View>
  );
}

export default Sparkline;
