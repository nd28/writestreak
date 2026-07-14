import React, { useState, useCallback, useRef } from "react";
import { Box, Text, useInput } from "ink";

interface EditorProps {
  onTextChange: (text: string) => void;
  initialText?: string;
}

export function Editor({ onTextChange, initialText = "" }: EditorProps) {
  const [text, setText] = useState(initialText);
  const [cursorLine, setCursorLine] = useState(0);

  const updateText = useCallback((newText: string) => {
    setText(newText);
    onTextChange(newText);
    const lines = newText.split("\n");
    setCursorLine(lines.length);
  }, [onTextChange]);

  useInput((input, key) => {
    if (key.ctrl && input === "s") {
      return;
    }

    if (key.return) {
      updateText(text + "\n");
      return;
    }

    if (key.backspace || key.delete) {
      if (text.length > 0) {
        updateText(text.slice(0, -1));
      }
      return;
    }

    if (key.tab) {
      updateText(text + "  ");
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      updateText(text + input);
    }
  });

  const lines = text.split("\n");
  const displayLines = lines.slice(-15);
  const totalLines = lines.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      flexGrow={1}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text color="cyan" bold>EDITOR</Text>
        <Text dimColor>Ln {totalLines} | {text.length} chars</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {displayLines.map((line, i) => (
          <Text key={totalLines - displayLines.length + i}>
            <Text dimColor>{String(totalLines - displayLines.length + i + 1).padStart(3)} </Text>
            {line || " "}
            {i === displayLines.length - 1 && <Text color="green">▌</Text>}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
