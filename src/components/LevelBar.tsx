import React from "react";
import { Box, Text } from "ink";

interface LevelBarProps {
  level: number;
  title: string;
  progress: number;
  currentXp: number;
  nextXp: number;
}

export function LevelBar({ level, title, progress, currentXp, nextXp }: LevelBarProps) {
  const barWidth = 20;
  const filled = Math.floor(progress * barWidth);
  const empty = barWidth - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  return (
    <Box flexDirection="row" alignItems="center" gap={1}>
      <Text color="cyan" bold>LVL {level}</Text>
      <Text color="yellow">{title}</Text>
      <Text color="green">{bar}</Text>
      <Text dimColor>{currentXp}/{nextXp} XP</Text>
    </Box>
  );
}
