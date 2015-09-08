# extractor.photo.pixiv.tbrl.js
Pixiv extractor patch for taberareloo.

This patch port from tombfix pixiv extractor.

# See
[Patches for Taberareloo](https://github.com/taberareloo/patches-for-taberareloo)

[tombfix extarctor](https://github.com/tombfix/core/blob/master/xpi/chrome/content/library/extractors.js)

# Changes
* Replace
  * addCallback -> then
  * addErrback -> catch
  * succeed -> Promise.resolve
  * downloadWithReferrer(url, referrer) -> downloadFile(url, {referrer: referrer})
  * getMessage('error.contentsNotFound') -> chrome.i18n.getMessage('error_http404')
* Delete
  * API functions and variables

# Build

    $ npm run build

# Install
[Click here](https://raw.githubusercontent.com/eru/extractor.photo.pixiv.tbrl.js/master/extractor.photo.pixiv.tbrl.js) and "Right click -> (taberareloo)Share -> Patch - Install"

# LICENSE
Taberareloo Code (The MIT License) Copyright (c) 2009 Constellation & Taberareloo Dev Team

Tombloo Code (Public Domain) Copyright (c) to & Tombloo Dev Team
