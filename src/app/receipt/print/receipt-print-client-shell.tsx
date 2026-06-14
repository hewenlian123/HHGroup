type Props = {
  children: React.ReactNode;
};

export function ReceiptPrintClientShell({ children }: Props) {
  return (
    <div className="mx-auto max-w-[8.5in] print:max-w-none">
      <div className="receipt-print-shell">{children}</div>
    </div>
  );
}
