import React from "react";
import { Box, Text } from "ink";

interface ScoreBarProps {
  wordCount: number;
  totalXp: number;
  streak: number;
}

export function ScoreBar({ wordCount, totalXp, streak }: ScoreBarProps) {
  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Box gap={2}>
        <Text>
          <Text color="magenta" bold>WORDS </Text>
          <Text color="white" bold>{wordCount}</Text>
        </Text>
        <Text>
          <Text color="green" bold>XP </Text>
          <Text color="white" bold>{totalXp}</Text>
        </Text>
      </Box>
      <Box>
        {streak > 0 && (
          <Text>
            <Text color="red" bold>STREAK </Text>
            <Text color="yellow" bold>{streak} days</Text>
            <Text color="orange"> x{(1 + streak * 0.1).toFixed(1)}</Text>
          </Text>
        )}
        {streak === 0 && <Text dimColor>No streak</Text>}
      </Box>
    </Box>
  );
}
