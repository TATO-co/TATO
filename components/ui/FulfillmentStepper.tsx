import { Text, View } from 'react-native';

type FulfillmentStepperProps = {
    currentStage: 'claimed' | 'listing_active' | 'sold' | 'awaiting_shipment' | 'shipped';
    title?: string;
    helperText?: string;
    statusNote?: string;
    className?: string;
};

const steps = [
    { key: 'claimed', label: 'Claimed' },
    { key: 'listing_active', label: 'Listing Active' },
    { key: 'sold', label: 'Sold' },
    { key: 'awaiting_shipment', label: 'Awaiting Shipment' },
    { key: 'shipped', label: 'Shipped' },
] as const;

export function FulfillmentStepper({
    currentStage,
    title = 'Fulfillment Tracking',
    helperText,
    statusNote,
    className,
}: FulfillmentStepperProps) {
    const currentIndex = steps.findIndex((s) => s.key === currentStage);
    const resolvedStatus = steps[currentIndex]?.label ?? 'Unknown';

    return (
        <View className={`rounded-[24px] border border-tato-line bg-[#09172d] p-5 ${className ?? ''}`}>
            <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1">
                    <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                        {title}
                    </Text>
                    {helperText ? (
                        <Text className="mt-2 text-sm leading-6 text-tato-muted">
                            {helperText}
                        </Text>
                    ) : null}
                </View>

                <View className="rounded-full border border-[#21406d] bg-[#102443] px-3 py-1.5">
                    <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-accent">
                        {resolvedStatus}
                    </Text>
                </View>
            </View>

            <View className="mt-5 rounded-[22px] border border-[#17355f] bg-[#0b1a30] px-4 py-5">
                <View className="flex-row items-center">
                {steps.map((step, index) => {
                    const isCompleted = index < currentIndex;
                    const isCurrent = index === currentIndex;

                    return (
                        <View className="flex-1 items-center" key={step.key}>
                            <View className="flex-row items-center w-full">
                                {/* Connecting line (left side) */}
                                {index > 0 ? (
                                    <View
                                        className={`flex-1 h-[2px] ${isCompleted || isCurrent ? 'bg-tato-accent' : 'bg-tato-line'}`}
                                    />
                                ) : (
                                    <View className="flex-1" />
                                )}

                                {/* Dot */}
                                <View
                                    className={`h-4.5 w-4.5 rounded-full border-2 ${isCompleted
                                            ? 'border-tato-accent bg-tato-accent'
                                            : isCurrent
                                                ? 'border-tato-accent bg-tato-base'
                                                : 'border-tato-line bg-tato-base'
                                        }`}
                                />

                                {/* Connecting line (right side) */}
                                {index < steps.length - 1 ? (
                                    <View
                                        className={`flex-1 h-[2px] ${isCompleted ? 'bg-tato-accent' : 'bg-tato-line'}`}
                                    />
                                ) : (
                                    <View className="flex-1" />
                                )}
                            </View>

                            {/* Label */}
                            <Text
                                className={`mt-3 text-center text-[10px] uppercase tracking-[0.5px] ${isCompleted || isCurrent ? 'text-tato-text' : 'text-tato-dim'
                                    }`}>
                                {step.label}
                            </Text>
                        </View>
                    );
                })}
                </View>
            </View>

            <View className="mt-4 border-t border-[#17355f] pt-3">
                <Text className="font-mono text-[10px] uppercase tracking-[1px] text-tato-dim">
                    Current Status
                </Text>
                <Text className="mt-2 text-sm text-tato-text">
                    {statusNote ?? `Claim is currently in the ${resolvedStatus.toLowerCase()} stage.`}
                </Text>
            </View>
        </View>
    );
}
