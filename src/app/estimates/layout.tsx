import { EstimateBuilderPageChrome } from "./_components/estimate-builder-page-chrome";

export default function EstimatesLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <EstimateBuilderPageChrome>{children}</EstimateBuilderPageChrome>;
}
