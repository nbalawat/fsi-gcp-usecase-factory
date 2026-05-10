"use client";

/**
 * Context that lets any descendant <MemoSection> request the section
 * editor without prop-drilling through every section component.
 *
 * The provider lives in <MemoWithEdit> at the case-page boundary; when
 * a banker clicks "Edit" inside any MemoSection, the section calls
 * `onEditSection(sectionKey)` and the parent opens the right-side
 * drawer with the right initial state.
 */

import * as React from "react";

interface Ctx {
  /** Open the editor drawer for this section. Undefined = not editable. */
  onEditSection?: (sectionKey: string) => void;
}

const MemoEditContext = React.createContext<Ctx>({});

export const MemoEditProvider: React.FC<{
  onEditSection?: (sectionKey: string) => void;
  children: React.ReactNode;
}> = ({ onEditSection, children }) => {
  const value = React.useMemo(() => ({ onEditSection }), [onEditSection]);
  return (
    <MemoEditContext.Provider value={value}>{children}</MemoEditContext.Provider>
  );
};

export function useMemoEdit(): Ctx {
  return React.useContext(MemoEditContext);
}
