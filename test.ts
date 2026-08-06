import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = async () => {
  const __filename = fileURLToPath(import.meta.url); // gives curr files path
  const __dirname = path.dirname(__filename);// gets the dir of current path
  const resumePath = path.join(__dirname, "resume.pdf"); //basically globally finding the current resume.pdf
  const fileBuffer = fs.readFileSync(resumePath);

  const form = new FormData();
  form.append("resume", new Blob([fileBuffer], { type: "application/pdf" }), "resume.pdf");
  form.append("url", "https://input-fields-theta.vercel.app/");
  form.append(
    "fieldData",
    " set my email as ash@pallet.com and then set my fav pokemon as charizard and select trainer type as collector,agree to terms "
  );
  form.append("finalQuery", "summarize what is in the page after submission");

  const res = await fetch("http://localhost:3000/api/fill-form", {
    method: "POST",
    body: form,
  });
  console.log(await res.json());
};

run()
