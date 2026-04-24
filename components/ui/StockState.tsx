import { Text, View } from 'react-native';

import type { StockState, StockStateHistoryEntry, StockViewer } from '@/lib/models';
import { getStockStatePresentation } from '@/lib/stock-state';

const toneClasses = {
  accent: { container: 'border-tato-accent/45 bg-tato-accent/10', text: 'text-tato-accent' },
  warning: { container: 'border-[#f5b942]/45 bg-[#f5b942]/10', text: 'text-[#f5b942]' },
  success: { container: 'border-tato-profit/45 bg-tato-profit/10', text: 'text-tato-profit' },
  info: { container: 'border-[#7cb7ff]/45 bg-[#1e6dff]/10', text: 'text-[#9cc8ff]' },
  tertiary: { container: 'border-tato-line bg-tato-panelSoft', text: 'text-tato-muted' },
} as const;

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function actorLabel(actor: StockStateHistoryEntry['actor']) {
  if (actor === 'supplier') {
    return 'Supplier';
  }

  if (actor === 'broker') {
    return 'Broker';
  }

  return 'System';
}

export function StockStatusBadge({
  state,
  viewer,
}: {
  state: StockState;
  viewer: StockViewer;
}) {
  const presentation = getStockStatePresentation(state, viewer);
  const tone = toneClasses[presentation.tone];

  return (
    <View className={`rounded-full border px-3 py-1.5 ${tone.container}`}>
      <Text className={`font-mono text-[11px] uppercase tracking-[1px] ${tone.text}`}>
        {presentation.label}
      </Text>
    </View>
  );
}

export function StockStateTimeline({
  states,
  currentState,
}: {
  states: StockStateHistoryEntry[];
  currentState: StockState;
}) {
  if (!states.length) {
    return null;
  }

  return (
    <View className="rounded-[24px] border border-tato-line bg-tato-panel p-5">
      <Text className="font-mono text-[11px] uppercase tracking-[1px] text-tato-dim">
        State Timeline
      </Text>
      <View className="mt-4 gap-3">
        {states.map((entry, index) => {
          const isCurrent = entry.state === currentState || index === states.length - 1;
          return (
            <View className="flex-row gap-3" key={`${entry.state}-${entry.timestamp}`}>
              <View className="items-center">
                <View className={`h-3.5 w-3.5 rounded-full ${isCurrent ? 'bg-tato-accent' : 'bg-tato-profit'}`} />
                {index < states.length - 1 ? <View className="mt-1 h-10 w-px bg-tato-line" /> : null}
              </View>
              <View className="min-w-0 flex-1 pb-2">
                <Text className="text-sm font-semibold text-tato-text">{entry.label}</Text>
                <Text className="mt-1 text-xs leading-5 text-tato-muted">
                  {actorLabel(entry.actor)} · {formatTimestamp(entry.timestamp)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
