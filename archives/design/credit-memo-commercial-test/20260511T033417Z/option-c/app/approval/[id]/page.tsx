// Option C — approval route, applied to the inline philosophy.
//
// The canvas asks for all 4 HITL gates to be addressable, including
// final_approval. Option C's design philosophy is "no separate
// approval page", but we still implement this route — as a
// fast-track summary of the inline decisions the analyst already
// made. The credit officer signs off in one click if everything is
// green; if anything is outstanding, they jump back to the exact
// section (no context switch).

import * as React from "react";
import { FastTrackApproval } from "../../../components/FastTrackApproval";

interface PageProps {
  params: { id: string };
}

const Page: React.FC<PageProps> = ({ params }) => {
  return <FastTrackApproval caseId={params.id} />;
};

export default Page;
