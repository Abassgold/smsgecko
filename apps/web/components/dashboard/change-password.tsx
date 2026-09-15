'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/ui/section-title';
import { Button } from '@/components/ui/button';
import { Field, TextInput } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { useChangePassword } from '@/lib/hooks';

export function ChangePassword() {
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState(false);
  const [mismatch, setMismatch] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    if (newPassword !== confirmPassword) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setDone(true);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        },
      },
    );
  };

  return (
    <Card className="p-6">
      <SectionTitle>Change Password</SectionTitle>

      <form className="mt-4 flex flex-col gap-4" onSubmit={submit}>
        <Field label="Current password">
          <TextInput
            type="password"
            required
            autoComplete="current-password"
            placeholder="Enter current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password">
            <TextInput
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Min 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm password" error={mismatch ? 'Passwords do not match' : undefined}>
            <TextInput
              type="password"
              required
              autoComplete="new-password"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Field>
        </div>

        {change.isError ? (
          <p className="text-sm text-danger">
            {change.error instanceof ApiError ? change.error.message : 'Could not change password'}
          </p>
        ) : null}
        {done ? (
          <p className="text-sm text-success">
            Password changed — other sessions were signed out.
          </p>
        ) : null}

        <Button type="submit" className="self-start" disabled={change.isPending}>
          {change.isPending ? 'Changing…' : 'Change Password'}
        </Button>
      </form>
    </Card>
  );
}
