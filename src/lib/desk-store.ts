import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BUSINESS_NUMBER, digits, samePhone } from "@/lib/phone";

export type Channel = "sms" | "whatsapp";

export type DeskMessage = {
  id: string;
  channel: Channel;
  direction: "inbound" | "outbound";
  peer: string;
  peerName?: string;
  text: string;
  status: string;
  at: string;
  telnyxId?: string;
  error?: string;
};

export type Contact = {
  phone: string;
  name: string;
  optedOut: boolean;
};

export type InboundEvent = {
  id: string;
  at: string;
  kind: "message" | "status";
  channel: Channel;
  direction: "inbound" | "outbound";
  peer: string;
  text: string;
  status: string;
  telnyxId?: string;
  error?: string;
};

type DeskState = {
  hydrated: boolean;
  apiKey: string;
  publicKey: string;
  businessNumber: string;
  businessLabel: string;
  profileId: string;
  deskToken: string;
  quickReplies: string[];
  contacts: Contact[];
  messages: DeskMessage[];
  setHydrated: (value: boolean) => void;
  setApiKey: (value: string) => void;
  setPublicKey: (value: string) => void;
  setBusinessNumber: (value: string) => void;
  setBusinessLabel: (value: string) => void;
  setProfileId: (value: string) => void;
  setDeskToken: (value: string) => void;
  setQuickReplies: (value: string[]) => void;
  upsertContact: (contact: Contact) => void;
  setOptOut: (phone: string, optedOut: boolean) => void;
  addMessage: (message: DeskMessage) => void;
  updateMessage: (id: string, patch: Partial<DeskMessage>) => void;
  mergeEvents: (events: InboundEvent[]) => void;
  clearMessages: () => void;
  disconnect: () => void;
};

const DEFAULT_REPLIES = [
  "Thanks for contacting WordPressistic. How can we help?",
  "Received. We will reply shortly.",
  "Reply STOP to opt out of texts from this number.",
];

function makeToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isStop(text: string): boolean {
  return /^(stop|stopall|unsubscribe|cancel|end|quit)$/i.test(text.trim());
}

export const useDesk = create<DeskState>()(
  persist(
    (set) => ({
      hydrated: false,
      apiKey: "",
      publicKey: "",
      businessNumber: BUSINESS_NUMBER,
      businessLabel: "WordPressistic",
      profileId: "",
      deskToken: "",
      quickReplies: DEFAULT_REPLIES,
      contacts: [],
      messages: [],
      setHydrated: (hydrated) => set({ hydrated }),
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setPublicKey: (publicKey) => set({ publicKey: publicKey.trim() }),
      setBusinessNumber: (businessNumber) => set({ businessNumber }),
      setBusinessLabel: (businessLabel) => set({ businessLabel }),
      setProfileId: (profileId) => set({ profileId: profileId.trim() }),
      setDeskToken: (deskToken) => set({ deskToken }),
      setQuickReplies: (quickReplies) => set({ quickReplies }),
      upsertContact: (contact) =>
        set((state) => {
          const key = digits(contact.phone);
          const rest = state.contacts.filter((item) => digits(item.phone) !== key);
          return { contacts: [...rest, contact] };
        }),
      setOptOut: (phone, optedOut) =>
        set((state) => ({
          contacts: state.contacts.map((item) =>
            samePhone(item.phone, phone) ? { ...item, optedOut } : item,
          ),
        })),
      addMessage: (message) =>
        set((state) => ({ messages: [...state.messages, message].slice(-800) })),
      updateMessage: (id, patch) =>
        set((state) => ({
          messages: state.messages.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        })),
      mergeEvents: (events) =>
        set((state) => {
          const messages = [...state.messages];
          const contacts = [...state.contacts];
          for (const event of events) {
            if (!event.peer) continue;
            if (event.kind === "status" && event.telnyxId) {
              const index = messages.findIndex((item) => item.telnyxId === event.telnyxId);
              if (index >= 0) {
                messages[index] = {
                  ...messages[index],
                  status: event.status || messages[index].status,
                  error: event.error || messages[index].error,
                };
                continue;
              }
            }
            const duplicate = messages.some(
              (item) =>
                item.id === event.id ||
                (event.telnyxId &&
                  item.telnyxId === event.telnyxId &&
                  item.direction === event.direction &&
                  item.text === event.text),
            );
            if (duplicate) {
              if (event.telnyxId) {
                const index = messages.findIndex((item) => item.telnyxId === event.telnyxId);
                if (index >= 0 && event.status) {
                  messages[index] = { ...messages[index], status: event.status, error: event.error };
                }
              }
              continue;
            }
            const known = contacts.find((item) => samePhone(item.phone, event.peer));
            messages.push({
              id: event.id,
              channel: event.channel,
              direction: event.direction,
              peer: event.peer,
              peerName: known?.name,
              text: event.text || "[no text]",
              status: event.status || (event.direction === "inbound" ? "received" : "sent"),
              at: event.at,
              telnyxId: event.telnyxId,
              error: event.error,
            });
            if (event.direction === "inbound" && isStop(event.text) && event.channel === "sms") {
              const key = digits(event.peer);
              const existing = contacts.find((item) => digits(item.phone) === key);
              if (existing) existing.optedOut = true;
              else contacts.push({ phone: event.peer, name: "", optedOut: true });
            }
          }
          return { messages: messages.slice(-800), contacts };
        }),
      clearMessages: () => set({ messages: [] }),
      disconnect: () => set({ apiKey: "", publicKey: "", profileId: "" }),
    }),
    {
      name: "line-desk-v1",
      skipHydration: true,
      partialize: (state) => ({
        apiKey: state.apiKey,
        publicKey: state.publicKey,
        businessNumber: state.businessNumber,
        businessLabel: state.businessLabel,
        profileId: state.profileId,
        deskToken: state.deskToken,
        quickReplies: state.quickReplies,
        contacts: state.contacts,
        messages: state.messages,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) {
          const token = useDesk.getState().deskToken || makeToken();
          useDesk.setState({ hydrated: true, deskToken: token });
          return;
        }
        if (!state.deskToken) {
          useDesk.setState({ deskToken: makeToken(), hydrated: true });
          return;
        }
        useDesk.setState({ hydrated: true });
      },
    },
  ),
);

export function contactFor(contacts: Contact[], phone: string): Contact | undefined {
  return contacts.find((item) => samePhone(item.phone, phone));
}
