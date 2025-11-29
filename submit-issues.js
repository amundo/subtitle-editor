// submit-issues.js
// Read issues.txt and submit each line as a GitHub issue using the gh CLI

const content = await Deno.readTextFile("issues.txt");

const issues = content
  .split("\n")
  .map(line => line.trim())
  .filter(Boolean); // skip empty lines

for (const title of issues) {
  console.log(`Submitting: ${title}`);

  const command = new Deno.Command("gh", {
    args: [
      "issue",
      "create",
      "--title", title,
      "--body", "Imported from issues.txt via submit-issues.js",
      // optionally:
      // "--repo", "yourname/yourrepo",
      // "--label", "bulk-import",
    ],
    stdout: "inherit",
    stderr: "inherit",
  });

  const { code } = await command.output();

  if (code === 0) {
    console.log(`✔ Submitted issue: ${title}`);
  } else {
    console.log(`❌ Failed to submit issue: ${title}`);
  }
}
