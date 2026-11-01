"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto mt-10 max-w-xl">
      <ErrorState
        title="Something went wrong on this page"
        description={
          <>
            Your data has not been changed. Try again, and if the problem continues contact your administrator
            {error.digest ? ` (reference ${error.digest})` : ""}.
          </>
        }
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
