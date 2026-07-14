import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { ScorePopup as ScorePopupType } from "../types.js";

interface ScorePopupsProps {
  popups: ScorePopupType[];
}

export function ScorePopups({ popups }: ScorePopupsProps) {
  const [visible, setVisible] = useState<ScorePopupType[]>([]);

  useEffect(() => {
    const recent = popups.filter(p => Date.now() - p.timestamp < 3000);
    setVisible(recent);
  }, [popups]);

  if (visible.length === 0) return null;

  return (
    <Box flexDirection="column" height={3}>
      {visible.slice(-3).map(popup => (
        <Text key={popup.id} color={popup.color} bold>
          {popup.text}
        </Text>
      ))}
    </Box>
  );
}
