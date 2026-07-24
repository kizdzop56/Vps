import React, { useEffect, useMemo, useRef } from "react";
import { View, Text, ScrollView, StyleSheet, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useColors } from "@/hooks/useColors";

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PADDING = (ITEM_HEIGHT * (VISIBLE_ITEMS - 1)) / 2;
const SETTLE_DELAY = 100;

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export type DateOfBirth = { day: number; month: number; year: number };

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function Wheel({
  data,
  selectedIndex,
  onSelect,
  renderLabel,
  width,
}: {
  data: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  renderLabel: (value: number) => string;
  width: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOffsetY = useRef(selectedIndex * ITEM_HEIGHT);
  // Tracks the index this wheel itself last committed via user scroll, so we
  // can tell apart "external" changes (a different wheel clamped our value,
  // or initial mount) from our own commits, and only force-scroll for the
  // former. This avoids fighting the user's in-progress scroll gesture.
  const committedIndex = useRef(selectedIndex);
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
      committedIndex.current = selectedIndex;
      lastOffsetY.current = selectedIndex * ITEM_HEIGHT;
      return;
    }
    if (selectedIndex !== committedIndex.current) {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: true });
      committedIndex.current = selectedIndex;
      lastOffsetY.current = selectedIndex * ITEM_HEIGHT;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  const commitFromOffset = (y: number) => {
    const index = Math.max(0, Math.min(data.length - 1, Math.round(y / ITEM_HEIGHT)));
    committedIndex.current = index;
    if (index !== selectedIndex) onSelect(index);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    lastOffsetY.current = y;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      commitFromOffset(lastOffsetY.current);
    }, SETTLE_DELAY);
  };

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    commitFromOffset(e.nativeEvent.contentOffset.y);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={{ width, height: WHEEL_HEIGHT }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      contentContainerStyle={{ paddingVertical: PADDING }}
      onScroll={handleScroll}
      onMomentumScrollEnd={handleMomentumEnd}
      onScrollEndDrag={handleMomentumEnd}
      scrollEventThrottle={16}
    >
      {data.map((value, index) => {
        const selected = index === selectedIndex;
        return (
          <View key={value} style={{ height: ITEM_HEIGHT, justifyContent: "center", alignItems: "center" }}>
            <Text
              // @ts-expect-error -- web-only attribute to opt out of Safari's data detectors
              translate="no"
              style={{
                fontSize: selected ? 19 : 16,
                fontWeight: selected ? "800" : "500",
                color: selected ? "#7c3aed" : "#9ca3af",
                textDecorationLine: "none",
              }}
            >
              {renderLabel(value)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

export default function WheelDatePicker({
  value,
  onChange,
  minYear,
  maxYear,
}: {
  value: DateOfBirth;
  onChange: (value: DateOfBirth) => void;
  minYear: number;
  maxYear: number;
}) {
  const colors = useColors();

  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i),
    [minYear, maxYear]
  );
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const maxDay = daysInMonth(value.month, value.year);
  const days = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => i + 1),
    [maxDay]
  );

  const dayIndex = Math.min(value.day, maxDay) - 1;
  const monthIndex = value.month - 1;
  const yearIndex = value.year - minYear;

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View pointerEvents="none" style={[styles.highlight, { borderColor: colors.primary + "40" }]} />
      <Wheel
        key="day"
        data={days}
        selectedIndex={dayIndex}
        onSelect={(i) => onChange({ ...value, day: days[i] })}
        renderLabel={(v) => String(v)}
        width={64}
      />
      <Wheel
        key="month"
        data={months}
        selectedIndex={monthIndex}
        onSelect={(i) => {
          const newMonth = months[i];
          const clampedDay = Math.min(value.day, daysInMonth(newMonth, value.year));
          onChange({ ...value, month: newMonth, day: clampedDay });
        }}
        renderLabel={(v) => MONTHS[v - 1]}
        width={128}
      />
      <Wheel
        key="year"
        data={years}
        selectedIndex={yearIndex}
        onSelect={(i) => {
          const newYear = years[i];
          const clampedDay = Math.min(value.day, daysInMonth(value.month, newYear));
          onChange({ ...value, year: newYear, day: clampedDay });
        }}
        renderLabel={(v) => String(v)}
        width={80}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 16,
    overflow: "hidden",
  },
  highlight: {
    position: "absolute",
    top: PADDING,
    left: 8,
    right: 8,
    height: ITEM_HEIGHT,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderRadius: 10,
  },
});
