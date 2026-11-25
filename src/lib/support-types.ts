export type DeskCard = {
  id: string;
  name: string;
  joinCode: string;
  role: string;
  anychatConnected: boolean;
  channelId: string;
};

export type MailboxCard = {
  id: string;
  label: string;
  address: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
};

export type MailCard = {
  id: string;
  mailboxId: string;
  mailbox: string;
  fromName: string;
  fromAddr: string;
  subject: string;
  snippet: string;
  body: string;
  at: string;
};
