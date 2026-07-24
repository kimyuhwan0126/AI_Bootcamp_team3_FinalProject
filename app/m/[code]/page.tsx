import MeetingClient from "./MeetingClient";

export default function MeetingPage({ params }: { params: { code: string } }) {
  return <MeetingClient code={params.code.toUpperCase()} />;
}
