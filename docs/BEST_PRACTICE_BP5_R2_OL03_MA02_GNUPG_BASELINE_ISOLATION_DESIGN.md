# BP-5 R-2 OL-03 MA-02：抽出用GnuPG固定候補・入手元・合成隔離試験計画

Version: draft-0.1 / Date: 2026-10-24 / Source baseline: `fa99c35` / Status: 設計案。候補版2.5.24、binary/依存digest・信頼元・実行環境・試験は未承認/未実施

## 1. 範囲・非実施事項

[候補fingerprint抽出設計](BEST_PRACTICE_BP5_R2_OL03_MA02_FINGERPRINT_EXTRACTION_PLAN.md)のF0を具体化する。目的は、後続の候補抽出に使う検証器の版/由来/隔離条件を決め、**実Rust鍵を使わない合成試験**の判定基準を固定すること。採用承認・検証器配備・試験成功を記録する文書ではない。

今回の操作は公式文書の参照とMD更新だけ。検証器の取得・導入・起動、実装、fixture作成/鍵生成・import、Rust/GnuPG鍵の承認、archive取得/展開、build、実機操作・OS接続・設定変更、担当者への連絡・token/permit発行は行わない。5項目Unknown・全体受付無効・telemetry保留、APPROVED_REGISTRY=None・通常v2 Unavailable/gate92・DER/absence停止を維持し、完成parts/本番cap/通常strictへ接続しない。

## 2. 固定版候補と公式根拠

**試験対象の版候補はGnuPG 2.5.24に固定する。** 「最新」「2.x」「2.5系」への可変追従はしない。これは版の設計上の選択で、動かしてよいbinaryの承認ではない。初期対象はmacOS arm64の専用隔離環境候補とし、具体的OS build/SDK・隔離基盤は未選定。Linux上の予備試験をmacOS対応の証拠へ読み替えない。

確認日2026-10-24、確認者AI、人による原文/採否レビューは未実施。

| 根拠URL・該当箇所 | 読み取れた内容と設計への反映 |
|---|---|
| [GnuPG Download: Source code releases](https://gnupg.org/download/index.html) | stable 2.5.24 / 2026-09-23を表示。sourceとsignatureの導線がある。リンク先archiveは今回取得していない |
| [2.5.24公式発表: Getting the Software / Checking the Integrity](https://lists.gnupg.org/pipermail/gnupg-announce/2026q3/000516.html) | 版・source配布pathを確認。発表では2.4系列のEOLを述べるため、古いmacOS向けpackageへ黙って下げない。発表中のSHA-1 checksum例だけでは本計画の信頼要件を満たさない |
| [Integrity Check: Verifying the File's Signature](https://gnupg.org/download/integrity_check.html) | 新しくdownloadしたGnuPG自身でsourceの完全性を検証せず、既存の信頼済み検証器を使うよう明記。信頼bootstrapを別責務にする |
| [公式Release Keys](https://gnupg.org/signature_key.html) | GnuPG配布鍵の確認入口。Rust鍵とは別のtrust rootであり、今回fingerprintの採用・鍵取得/import・署名検証はしない |
| [Supported Systems: macOS](https://gnupg.org/download/supported_systems.html) | macOS対応とGPGToolsへの案内。2.5.24の必要機能・binary真正性・本計画の隔離適合を保証する資料ではない |

最新版表示は無脆弱性/互換性保証ではない。取得/実行を承認する時点でsupport/security情報、採用版のmanual/DETAILS・sourceを再照合する。新しい版が必要なら別版の試験として計画を改版し、上書き置換しない。今回のonline manualは可変資料であり、採用buildのoption挙動を未検証のまま固定事実にしない。

## 3. 入手元と信頼bootstrapの選択

優先案は「署名付き公式sourceを、**既存の別の信頼済み検証環境**で認証し、組織管理下でbuild/固定配布する」方式。候補source参照pathは公式発表の`gnupg.org/ftp/gcrypt/gnupg/gnupg-2.5.24.tar.bz2`と同`.sig`。今回はURLの文書掲載だけを確認し、fileの存在/hash/signatureを個別確認していない。

| 経路 | 必要な信頼/証拠 | 現在の可否 |
|---|---|---|
| 優先：組織の既存検証環境→公式source→管理build | 既存検証器とGnuPG配布鍵の承認済み由来、source/依存の認証、toolchain/build recipe、最終binary/依存closure digest、配布記録 | 組織の既存環境・承認鍵・build担当・成果物は未提示。まだ利用可能とは認定しない |
| 代替：組織が既に信頼するpackage配布 | 署名済みrepository/snapshot、正確なupstream版＋package revision/patch、targetと全依存digest、組織の既存trust rootと更新停止 | 管理package/台帳の有無は未確認。単なるpackage名・版表示・HTTPSだけでは不可 |
| 参照のみ：GPGTools等のmacOS配布 | 実際のengine版・patch・署名者・notarization・依存/副作用の別審査 | OS対応案内だけでは2.5.24との一致を証明しない。今回採用しない |
| 不採用：新規取得binaryの自己検証/任意PATH/可変latest | 循環認証やmutable入力になる | 実施しない。Homebrew等のinstall/updateを暗黙に実行しない |

GnuPGを認証する鍵を未確認のRust鍵で認証しない。組織側に既存の信頼済み起点がなければVerifierUnavailableとして停止し、鍵server検索・同じWebからの自己申告hashだけで起点を作らない。必要な情報は利用者/責任者の提示を待つ。秘密鍵や個人keyringの提出は求めない。

### 3.1 固定配備票に必要なtuple

`GnuPG=2.5.24`に加え、package revision/patch集合、source/archive/signatureのdigestと検証記録、build compiler/SDK/linker/flags、target/OS build、gpg実行binaryのdigestを固定する。動的library・helper・設定・locale等、実行時に参照可能な全closureと許可pathを列挙し、digest/署名・metadata・originを確認する。公式表のlibrary最新版一覧を、検証済み依存組合せとしてコピーしない。

agent/keyboxd/dirmngr/pinentry等は「未使用予定」だけで除外せず、起動禁止と外側監視の対象にする。OS runtime libraryの範囲はOS image/buildへ結合し、任意dylib/loader envを認めない。採用manual/DETAILSも同source版へ結合する。現段階でこれらの期待digestは**未取得**で、空欄をwildcardや0で埋めない。

署名付きsourceからのbuildは署名された公式macOS binaryと同義ではない。build入力から成果物への由来を組織の既存証拠で担保し、再現build未実施なら未実施と記録する。build/配布票が揃うまで合成試験にも任意binaryを使わない。

## 4. 合成試験の実施単位と隔離

実施は別途承認後。まずfixture/期待値と外側監視の試験を準備し、その後に固定binaryを起動する。すべて専用の空scratchと合成公開入力だけで行い、実Rust鍵・実ユーザーの秘密/公開keyring・credentials・PDIはマウントしない。

| 対象 | 将来の構成案 | 判定に必要な証拠 |
|---|---|---|
| 実行環境 | macOS arm64の破棄可能な専用VM/snapshot等。OS image/隔離基盤/監視器は固定して別承認 | 現在の作業端末へsandbox設定を追加しない。既存の適合環境がなければ停止 |
| filesystem | 検証器closure/fixtureはread-only。空の専用home/cwd/scratchのみ限定。個人HOME・workspace・鍵ring・agent socketは見せない | 外側からfile open/write/rename/execと拒否されたアクセスも観測。前後hashだけで非アクセスを証明しない |
| network/IPC | 外側で送受信・名前解決・外部socket接続を禁止。agent/keyboxd等の自動spawnも拒否 | 「通信できなかった」と「試みなかった」を分離。禁止試行が1件でもあれば隔離適合は不合格 |
| 子process | 固定gpgだけを許可する初期subset。shell/agent/helperへ委譲しない | process tree、exec試行、終了確認。必要helperが判明してもその場でallowlistへ追加しない |
| argv/env | 親設計のshow-keys系だけを固定。no-options/空home/自動取得禁止等を採用版で検証。外部flags/loader/proxy/実HOMEを継承しない | 実argv/envの許可項目照合。秘密は投入せず、注入試験は合成canaryだけ |
| 終了 | 外側deadline・取消→停止/終了確認→scratch廃棄。元環境はread-only | 終了未確認/監査欠落/廃棄失敗は成功にしない。OS側の保証が不足すれば未確認で止める |

監視が特権・OS設定変更・追加softwareを必要とする場合は別途許可を得る。通常のアプリ権限で監査できると仮定しない。禁止アクセスの検出・強制停止が確認できない環境を「合成だから安全」として採用しない。

初期上限案は親設計の入力256KiB・primary 1/subkey 16・record 512・1行16KiB・各出力1MiB・全体30秒を維持する。加えて試験child CPU 10秒・memory 256MiB・FD 64を候補とするが、どれも未承認/未計測の試験制限である。VM自体のmemoryを256MiBとする意味ではない。監視/終了処理も全体時間内に予算を持ち、上限で止まった試験を正常なfingerprint拒否と混同しない。

## 5. fixtureと独立oracleの作り方（今回は作成しない）

fixtureは非本番の固定OpenPGP公開鍵入力と、それに対する期待record/限定結果を分離する。primary/subkeyの全fingerprintは、仕様・既知test vectorまたは別の既に信頼済みfixture作成系から独立に決める。被試験GnuPGの出力をそのままgoldenへ保存して合格させない。新しいfixture生成系を使う場合は、その入手/起動も別承認が必要。

秘密鍵拒否の試験は完全に非本番のダミーだけを用い、key生成/importをこの計画に先取りしない。出力抑制canaryは架空文字列で、実秘密を投入しない。baselineのpublic v4/40-hex形式、作成/期限の合成時刻を固定し、現在時刻依存で期待値が変わらない試験を用意する。検証器へ与えるclockの固定方法/信頼は別に承認し、OS時計を変更しない。

## 6. 合成試験matrix

以下は未実装/未実行のケース案。F01〜F10は固定binaryの表示経路、R01〜R04は後続のrecord解釈器の入力契約、I01〜I06は外側隔離/終了の試験であり、互いの成功を代用しない。

| ID | 入力/事象 | 期待する限定結果 |
|---|---|---|
| F01 | public primary1/subkey2の正常fixture | 独立oracleの全桁と対応が一致。candidate_unapprovedのみ |
| F02 | 有効な別public鍵、同じ/似たUID | 別fingerprint候補。UID/末尾IDで同じ鍵にまとめない |
| F03 | primary2の公開鍵bundle | exact1違反で拒否。先頭/末尾だけ採用しない |
| F04 | ダミーsecret primary/subkey | 拒否し、秘密record/本文/canaryを限定報告へ出さない。除外されてpublicだけに見える場合も検出可能性を審査 |
| F05 | 空/切断/不正armor/不正packet | 明確な入力/検証器失敗として拒否。exit0だけで候補成功にしない |
| F06 | 報告上の期限切れ/失効表示fixture | 後続停止。表示成功と信頼成功を分離 |
| F07 | 未対応のfingerprint形式/鍵形式 | Unsupported。40桁へ切詰め/旧形式へ自動fallbackしない |
| F08 | 同主鍵・異なるsubkey/不足subkey | 対応集合がoracleと合うこと。別入力を同じ証拠票として扱わない |
| F09 | 入力上限ちょうど/1超過、UID/notation等の大量入力 | 境界成功または明示上限拒否。出力/内部資源超過は別理由で停止 |
| F10 | 非許可option/個人HOME/loader envの合成注入 | 起動前拒否または固定設定へ遮断。外側個人領域へのアクセスなし |
| R01 | primary/subkeyのfpr欠落・重複・順序曖昧 | record契約違反。key IDから補完しない |
| R02 | 40-hex以外、fp2のみ、切断record | 未対応/不正として拒否。fprの代用禁止 |
| R03 | 未知record・余剰field・大量行 | 採用版の明示互換規則と有限上限で判定。黙って無制限ignoreしない |
| R04 | stderr/UIDに制御文字・偽成功文・合成canary | 機械recordと限定reasonだけを使い、任意文字列を成功根拠/ログへ昇格しない |
| I01 | 監視器検査用の禁止network/外側file/agent接続試行 | 拒否と試行を監視できる。負の対照が見えなければ他ケースの無試行を主張しない |
| I02 | 普通のshow-keysの前後 | 永続keyring/trust DB更新なし、禁止試行/spawnなし。許可外file生成も拒否 |
| I03 | child待機/停止無応答/途中取消 | 外側上限内で停止・終了確認。未確認なら終了未確認として残す |
| I04 | 出力1MiB超・CPU/memory/FD上限 | bounded停止。最後まで表示できた範囲を成功候補にしない |
| I05 | 起動前/入力読取中のfixture・binary差替え | 同一入力/同一検証器結合の失敗。可変pathを再openして継続しない |
| I06 | 監査ログ欠落・scratch廃棄失敗 | 先行理由を保持し、隔離未確認/cleanup不成立を併記。成功票なし |

R系はGnuPGが実際にその不正出力を生成したという想定ではなく、後続境界の防御試験である。I01/I03/I04のfault sourceも別の合成test-only対象で、実gpgにfault注入した証拠と混ぜない。F系の実binary試験・R系の純粋試験・I系の監督試験を記録上も分ける。

F04は重要な実施前確認点である。show-keysが秘密入力をpublic情報へ射影し、colon出力だけではsecret packetの存在を判別できない場合、成功へ緩和しない。既存の信頼済み機構でpublic-only入力を検査できるかを別設計し、それが無ければこの入口を未対応として止める。独自packet parserを即席で追加しない。

## 7. 合格条件・保存する証拠

合格は同じ固定tupleで必要な全試験が期待どおりとなり、独立oracle一致・禁止操作検出の負の対照・監査完全性・終了/cleanup確認が揃った場合だけ。拒否ケースは「どこかで失敗した」だけでは通さず、期待phase/reasonと後続非到達を要求する。未実施/未対応/監視不能はskip成功にしない。

試験票に検証器/source/build/OS/監視器tuple、fixtureとoracle版/digest、固定argv/envの許可field、期待/実結果、workではなく試験資源上限、access/process監査の集計、入力/出力bytes、終了/cleanupを保持する。UID本文・secretダミー・任意stderrは共有summaryへ出さない。未加工の調査証拠を必要とする場合は別権限で扱い、保存先/保持期間を先に承認する。

合格後も候補抽出を信頼承認へ変換せず、実Rust鍵の抽出は別途の操作許可を必要とする。独立fingerprint確認・失効/期限/用途・manifest暗号検証・archive照合・実layout/全体必要量は別工程。

## 8. 開始前の不足・明示承認待ち

- 既存の信頼済み検証環境/配布台帳、GnuPG配布鍵の独立な承認根拠、管理build/配布担当。
- 2.5.24の実source/signature/依存認証・最終binary/closure期待digest。今回版だけを選び、hashを推定していない。
- macOS arm64の固定OS/監視/隔離手段、適切な資源上限、禁止アクセス試行/agent停止を確認する能力。
- fixture/oracleの信頼する作成元・保管先・合成秘密入力の管理、F04 public-only入力判別の成立性。
- software取得・導入/build・環境作成/設定・起動/fixture試験それぞれの操作許可。担当者連絡も独立した許可が必要。

現状は上記未承認のため試験開始不可。次に利用者/責任者が提示する既存の信頼元と隔離環境の候補を照合し、実施可能性を判断する。情報が無ければVerifierUnavailable/IsolationUnavailableとして停止を維持し、さらに同種の文書を増やすだけで承認済みにはしない。
