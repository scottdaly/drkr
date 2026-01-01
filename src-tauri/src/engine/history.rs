use std::collections::VecDeque;

#[derive(Debug, Clone)]
pub struct HistoryEntry {
    pub id: String,
    pub name: String,
    pub timestamp: i64,
    // In a real implementation, this would store document snapshots or deltas
}

pub struct HistoryManager {
    undo_stack: VecDeque<HistoryEntry>,
    redo_stack: Vec<HistoryEntry>,
    max_entries: usize,
}

impl HistoryManager {
    pub fn new(max_entries: usize) -> Self {
        Self {
            undo_stack: VecDeque::with_capacity(max_entries),
            redo_stack: Vec::new(),
            max_entries,
        }
    }

    pub fn push(&mut self, entry: HistoryEntry) {
        // Clear redo stack on new action
        self.redo_stack.clear();

        // Remove oldest entry if at capacity
        if self.undo_stack.len() >= self.max_entries {
            self.undo_stack.pop_front();
        }

        self.undo_stack.push_back(entry);
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    pub fn undo(&mut self) -> Option<&HistoryEntry> {
        if let Some(entry) = self.undo_stack.pop_back() {
            self.redo_stack.push(entry);
            self.redo_stack.last()
        } else {
            None
        }
    }

    pub fn redo(&mut self) -> Option<&HistoryEntry> {
        if let Some(entry) = self.redo_stack.pop() {
            self.undo_stack.push_back(entry);
            self.undo_stack.back()
        } else {
            None
        }
    }

    pub fn clear(&mut self) {
        self.undo_stack.clear();
        self.redo_stack.clear();
    }
}
