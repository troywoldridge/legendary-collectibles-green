import CsvUploader from "./uploader";

export default function IntakePage() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 28, fontWeight: 800 }}>INTAKE PAGE MARKER</div>
      <div style={{ marginTop: 16 }}>
        <CsvUploader />
      </div>
    </div>
  );
}
