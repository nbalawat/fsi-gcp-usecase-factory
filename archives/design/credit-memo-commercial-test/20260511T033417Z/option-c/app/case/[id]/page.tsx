// Option C — case detail with PER-SECTION inline action bars.
//
// Variation axis: affordance (inline-per-section).
// Decisions live next to the data that informs them. No sticky footer.
// No modal drawer. The user's eye never has to leave the section to
// act on it.
//
// Server component → renders a Client child to keep the inline-action
// state on the page boundary (no inline functions passed across the
// Server/Client boundary, per UI standards Rule 5).

import * as React from "react";
import { CaseMemo } from "../../../components/CaseMemo";

interface PageProps {
  params: { id: string };
}

const Page: React.FC<PageProps> = ({ params }) => {
  return <CaseMemo caseId={params.id} />;
};

export default Page;
