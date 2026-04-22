# rpf-markdown-preview README

A markdown previewing extension for RPF markdown

## Features

- Preview Markdown files for the projects site
- Live updates with each change to the markdown file

## Installation

1. Download the latest `.vsix` file from the [Releases](https://github.com/RaspberryPiFoundation/rpf-markdown-preview/releases) page
2. Open Visual Studio Code
3. Press Command+Shift+P to open the command menu and search for "Extensions: Install from VSIX" and select it
4. When the file browser opens, find where you downloaded the `.vsix` file from step 1 and open it.
5. The extension should be installed.
6. Open a `.md` markdown file and click the RPF Markdown: Open Preview button in the tab bar.

## Publishing a new release:

1. Open a PR and increment the version number in `package.json`
2. Merge the PR
3. Create a Release with a tag for the version
4. Once the Release is created, the .vsix file should be uploaded to the release shortly after.
