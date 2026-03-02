# Chrome Web Store Publish Guide

This guide is for publishing the Chrome extension in this repo to the Chrome Web Store.

It is based on the current official Chrome Web Store docs checked on March 2, 2026.

## 1. What You Need Before You Upload

Before you can publish, Google currently requires:

1. A Chrome Web Store developer account.
2. A one-time developer registration fee.
3. 2-Step Verification enabled on the Google account that will publish the extension.

Official docs:

- [Register your developer account](https://developer.chrome.com/docs/webstore/register)
- [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)

## 2. What This Repo Still Needs Before Submission

The extension is functional as a local MVP, but it is not yet ready for store submission as-is.

You still need to add:

1. Manifest icons.
2. Store screenshots.
3. A small promo tile.
4. A store description.
5. Privacy disclosures that match the real behavior of the extension.
6. A privacy policy URL if you handle user data.

Important current requirement from Chrome policy and listing docs:

- If the listing is missing an icon or screenshots, it can be rejected.
- Your extension must have a single purpose that is narrow and easy to understand.
- Your privacy fields must accurately describe the extension's purpose, permissions, and data use.

Official docs:

- [Listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/)
- [Use of permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions/)

## 3. Repo-Specific Checklist

For this project, your Chrome Web Store story should be simple and honest:

- Single purpose: capture the active webpage's visible design structure and export it as JSON for import into Figma.
- Permissions story:
  - `activeTab`: needed so the extension can inspect only the tab the user explicitly captures.
  - `scripting`: needed to inject the capture script into the active tab.
  - `downloads`: needed to save the exported `.scene.json`.
  - `storage`: needed to remember local capture settings.
- Data handling story:
  - the extension reads page structure and visible content only when the user clicks capture
  - it exports that data locally as JSON
  - if you do not send the data to your server, say that clearly

Do not claim:

- full website cloning
- perfect 1:1 conversion for all sites
- support you do not actually have yet

That kind of over-claiming can create listing or review trouble.

## 4. Add the Required Icons

Chrome recommends raster icons in the manifest. For publishing, you should add at least:

- `16x16`
- `32x32`
- `48x48`
- `128x128`

The store icon requirement currently includes a `128x128` PNG. The store images guide also says the actual artwork should sit inside transparent padding for the full `128x128` asset.

Put them in:

- `/Users/cristian/Documents/GitHub/web-to-figma/apps/chrome-extension/icons/`

Then update:

- `/Users/cristian/Documents/GitHub/web-to-figma/apps/chrome-extension/manifest.json`

Example:

```json
"icons": {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

Official docs:

- [Configure extension icons](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons)
- [Supplying images](https://developer.chrome.com/docs/webstore/images)

## 5. Create Store Assets

The current Chrome Web Store docs say you need:

- at least one screenshot
- a `128x128` store icon
- a `440x280` small promo tile

Recommended screenshot size:

- `1280x800`

The docs also allow:

- `640x400`

Recommended assets for this extension:

1. Screenshot of the popup before capture.
2. Screenshot of the popup after capture showing the summary.
3. Screenshot of the downloaded JSON file.
4. Screenshot or mockup of the Figma plugin importing the result.
5. Promo tile showing the workflow: Website -> JSON -> Figma.

Official docs:

- [Store listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)
- [Supplying images](https://developer.chrome.com/docs/webstore/images)

## 6. Prepare the Privacy and Policy Answers

This is the part that usually slows review.

You need to fill out the Privacy tab accurately:

1. Single purpose description.
2. Permission justifications.
3. Remote code declaration.
4. Data usage disclosure.
5. Privacy policy URL if required.

For this extension, a good single-purpose draft is:

```text
Capture the visible structure and styling of the active webpage and export it as a JSON scene file for import into Figma.
```

Permission justifications draft:

```text
activeTab: Lets the user capture only the page they explicitly select.
scripting: Injects the capture script into the active tab at capture time.
downloads: Saves the exported scene JSON file to the user's machine.
storage: Stores local capture settings such as max nodes and image inclusion.
```

Remote code declaration:

- If you keep all logic packaged inside the extension, declare that you are not using remote code.

Privacy note:

- If the extension handles user data, Chrome policy says you must provide an accurate and up-to-date privacy policy.
- Because this extension reads webpage content and exports it, assume you will need a privacy policy unless you keep the behavior extremely local and your dashboard answers clearly reflect that behavior.

This is an inference from the policy pages and the privacy-field guidance. Review the exact data flows before you submit.

Official docs:

- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/)
- [Privacy policies](https://developer.chrome.com/docs/webstore/program-policies/privacy)
- [Disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)
- [Limited use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)

## 7. Package the Extension

For the Chrome Web Store, you upload a ZIP of the extension package.

For this repo, package the contents of:

- `/Users/cristian/Documents/GitHub/web-to-figma/apps/chrome-extension`

Do not zip the whole repo. Zip the extension app folder contents.

Before zipping:

1. Make sure `manifest.json` is final.
2. Add icons.
3. Remove any files you do not want shipped.
4. Confirm there is no remote code loading.
5. Load the unpacked extension in Chrome and test the exact ZIP contents locally.

## 8. Upload to the Chrome Web Store

The official upload flow is currently:

1. Open the Chrome Developer Dashboard.
2. Sign in with your publisher account.
3. Click `Add new item`.
4. Choose the ZIP file and upload it.

After upload, fill out:

1. Package
2. Store Listing
3. Privacy
4. Distribution
5. Test instructions, if reviewers need them

Official docs:

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/)
- [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/)

## 9. Recommended Listing Copy Structure

Keep the listing narrow and concrete.

Suggested title style:

- `Web to Figma Capture`

Suggested short description style:

- `Capture the active webpage and export a Figma-ready scene JSON.`

Suggested long description structure:

1. One sentence on the main purpose.
2. A short features list.
3. A short workflow list.
4. A limitations section.

Example:

```text
Web to Figma Capture exports the visible structure of the current webpage as a scene JSON file for import into Figma.

Features:
- Capture the active tab on demand
- Export layout, text, image, and basic style information
- Save the result as a .scene.json file
- Copy the scene JSON directly for paste into the paired Figma plugin

Typical workflow:
1. Open a webpage
2. Capture it with the extension
3. Save or copy the JSON
4. Import it in the paired Figma plugin

Current limitations:
- Captures the visible viewport only
- Complex CSS effects may not be recreated exactly
- Some remote images may fail to import in Figma
```

## 10. Distribution Choice

For a first release, you have two sensible options:

1. `Unlisted`
2. `Public`

Use `Unlisted` first if:

- you want private testing
- you are still adjusting capture fidelity
- you want a review-approved URL before public launch

Use `Public` when:

- the onboarding is clear
- the listing assets are polished
- the privacy answers are final
- the product behavior is stable enough for strangers

Official doc:

- [Set up payment and distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution/)

## 11. Use Deferred Publishing

The current publish flow lets you submit for review without auto-publishing after approval.

That is the safer launch path.

Recommended:

1. Submit for review.
2. Disable automatic publish after review.
3. Wait for approval.
4. Publish manually when your website, docs, and support links are ready.

The current docs say a staged approval can sit for up to 30 days before it reverts to draft.

Official doc:

- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/)

## 12. Add Reviewer Test Instructions

For this extension, reviewer instructions should be simple.

Example:

```text
1. Open any normal website, such as https://example.com
2. Click the extension toolbar icon
3. Click "Capture + Download" or "Capture + Copy JSON"
4. Confirm that the extension exports a .scene.json file or copies JSON to the clipboard

No login is required.
No paid features exist.
The extension only runs when the user clicks capture.
```

If you later add a companion website or licensing, update this.

## 13. Likely Review Risks For This Product

These are the biggest real review risks for this specific extension:

1. Permissions feel broader than the listing explains.
2. Data-use disclosures are too vague for a page-capture product.
3. The listing implies full website cloning or unsupported fidelity.
4. The extension ships without required store assets.
5. The product is judged as low-functionality if the local UX is too rough.

To reduce risk:

1. Keep permissions minimal.
2. Explain capture behavior in plain English.
3. Add polished screenshots and icons.
4. Keep the product promise narrow.
5. Test broken pages and error states before submission.

## 14. Optional Hardening After Launch

Once publishing works, the next useful store-facing improvements are:

1. Add a proper privacy policy page.
2. Add verified publisher status with an official site.
3. Use the Chrome Web Store API for updates.
4. Consider verified uploads, which Chrome introduced on May 7, 2025 as an opt-in signing safeguard for future uploads.

Official docs:

- [Use the Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api)
- [Verified uploads in the Chrome Web Store](https://developer.chrome.com/blog/verified-uploads-cws)

## 15. Practical Publish Order

For this repo, the best order is:

1. Finish the extension UX.
2. Add icons to the manifest.
3. Create screenshots and the `440x280` promo tile.
4. Write the privacy policy and privacy-field answers.
5. ZIP `apps/chrome-extension`.
6. Upload to the Developer Dashboard.
7. Fill Store Listing, Privacy, Distribution, and Test Instructions.
8. Submit with deferred publishing.
9. Fix any reviewer feedback.
10. Publish.
