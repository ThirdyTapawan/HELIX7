// branchResolver.js
// Decides which story node comes next based on the accuracy of the
// transcription just submitted.

// Returns the next node id, or null if the current node is terminal.
// Accuracy at or above 80 follows the "good" branch; below follows "bad".
export function resolveNext(node, accuracy) {
  if (node.ending) return null
  return accuracy >= 80 ? node.good : node.bad
}
