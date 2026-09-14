import { Suspense } from 'react';
import { DepositPicker } from './deposit-picker';

export default function DepositPage() {
  return (
    <Suspense>
      <DepositPicker />
    </Suspense>
  );
}
