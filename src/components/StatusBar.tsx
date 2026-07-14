import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  mode: string;
  sessionTitle: string;
}

export function StatusBar({ mode, sessionTitle }: StatusBarProps) {
  return (
    <Box flexDirection="row" justifyContent="space-between" width="100%">
      <Text>
        <Text color="black" backgroundColor="cyan" bold> {mode.toUpperCase()} </Text>
        <Text> {sessionTitle}</Text>
      </Text>
      <Text dimColor>
        Ctrl+S save | Ctrl+E export | Ctrl+Q quit
      </Text>
    </Box>
  );
}
