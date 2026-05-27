import { StudyDomeNav } from "./_components/study-dome-nav";

export default function StudyDomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <StudyDomeNav />
      {children}
    </>
  );
}
