import { createClient } from "@/lib/supabase/server";
import { getUnreadMessagesCount } from "./actions";
import { UnreadMessagesProvider } from "./unread-messages-provider";

export async function UnreadMessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const initialCount = user ? await getUnreadMessagesCount() : 0;

  return (
    <UnreadMessagesProvider
      initialCount={initialCount}
      currentUserId={user?.id ?? null}
    >
      {children}
    </UnreadMessagesProvider>
  );
}
