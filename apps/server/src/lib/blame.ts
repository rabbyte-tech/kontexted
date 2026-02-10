type DiffOp =
  | { type: "equal"; prevIndex: number; nextIndex: number }
  | { type: "delete"; prevIndex: number }
  | { type: "insert"; nextIndex: number };

export type BlameRow = {
  lineNumber: number;
  authorUserId: string;
  revisionId: number;
  touchedAt: Date;
};

export const diffLines = (previous: string[], next: string[]) => {
  const prevLength = previous.length;
  const nextLength = next.length;
  const table: number[][] = Array.from({ length: prevLength + 1 }, () =>
    Array(nextLength + 1).fill(0)
  );

  for (let i = prevLength - 1; i >= 0; i -= 1) {
    for (let j = nextLength - 1; j >= 0; j -= 1) {
      if (previous[i] === next[j]) {
        table[i][j] = table[i + 1][j + 1] + 1;
      } else {
        table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;

  while (i < prevLength && j < nextLength) {
    if (previous[i] === next[j]) {
      ops.push({ type: "equal", prevIndex: i, nextIndex: j });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ type: "delete", prevIndex: i });
      i += 1;
    } else {
      ops.push({ type: "insert", nextIndex: j });
      j += 1;
    }
  }

  while (i < prevLength) {
    ops.push({ type: "delete", prevIndex: i });
    i += 1;
  }

  while (j < nextLength) {
    ops.push({ type: "insert", nextIndex: j });
    j += 1;
  }

  return ops;
};

export const buildNextBlame = (
  previousContent: string,
  nextContent: string,
  previousBlame: BlameRow[],
  authorUserId: string,
  revisionId: number
) => {
  const prevLines = previousContent.split("\n");
  const nextLines = nextContent.split("\n");
  const blameByLine = new Map(
    previousBlame.map((row) => [row.lineNumber, row])
  );

  const ops = diffLines(prevLines, nextLines);
  const nextBlame: BlameRow[] = [];
  const now = new Date();
  let nextLineNumber = 1;

  ops.forEach((op) => {
    if (op.type === "equal") {
      const prevLineNumber = op.prevIndex + 1;
      const previous = blameByLine.get(prevLineNumber);
      if (previous) {
        nextBlame.push({
          lineNumber: nextLineNumber,
          authorUserId: previous.authorUserId,
          revisionId: previous.revisionId,
          touchedAt: previous.touchedAt,
        });
      } else {
        nextBlame.push({
          lineNumber: nextLineNumber,
          authorUserId,
          revisionId,
          touchedAt: now,
        });
      }
      nextLineNumber += 1;
      return;
    }

    if (op.type === "insert") {
      nextBlame.push({
        lineNumber: nextLineNumber,
        authorUserId,
        revisionId,
        touchedAt: now,
      });
      nextLineNumber += 1;
    }
  });

  return nextBlame;
};
