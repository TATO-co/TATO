import { Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

type KpiCardProps = {
    label: string;
    value: string;
    delta: string;
    tone?: 'neutral' | 'positive' | 'accent';
    sparklineData?: number[];
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
    if (!data.length) return null;

    const width = 120;
    const height = 32;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data
        .map((v, i) => {
            const x = (i / (data.length - 1)) * width;
            const y = height - ((v - min) / range) * height;
            return `${x},${y}`;
        })
        .join(' ');

    return (
        <Svg height={height} width={width}>
            <Polyline
                fill="none"
                points={points}
                stroke={color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
            />
        </Svg>
    );
}

const toneColors = {
    positive: { text: 'text-tato-profit', spark: '#1ec995' },
    accent: { text: 'text-tato-accent', spark: '#1e6dff' },
    neutral: { text: 'text-tato-text', spark: '#8ea4c8' },
};

export function KpiCard({ label, value, delta, tone = 'neutral', sparklineData }: KpiCardProps) {
    const colors = toneColors[tone];

    return (
        <View className="flex-1 rounded-[20px] border border-tato-line bg-tato-panel p-4">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                {label}
            </Text>
            <Text className={`mt-2 text-3xl font-bold ${colors.text}`}>
                {value}
            </Text>
            <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-xs text-tato-muted">{delta}</Text>
                {sparklineData ? <Sparkline color={colors.spark} data={sparklineData} /> : null}
            </View>
        </View>
    );
}
