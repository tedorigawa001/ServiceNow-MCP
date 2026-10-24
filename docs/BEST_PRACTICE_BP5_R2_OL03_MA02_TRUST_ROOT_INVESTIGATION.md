# BP-5 R-2 OL-03 MA-02：1.98.1 manifest署名・trust root確認経路調査

Version: draft-0.1 / Date: 2026-10-24 / Source baseline: `304681d` / Status: 読み取り調査。署名blobの存在確認のみ、暗号検証・鍵の独立確認・承認は未実施

## 1. 結論と非実施範囲

[真正性検証・installed照合手順](BEST_PRACTICE_BP5_R2_OL03_MA02_ARTIFACT_AUTHENTICITY_PLAN.md)のG0に向けた調査である。

- 対象1.98.1のmanifest分離署名候補は、日付付き/版付きの2 URLでHTTP 200、ASCII armorの署名headerを確認した。2応答のSHA-256は一致した。
- 現行の公式Forge文書にRust signing keyの配布URLとKeybaseプロフィールへのリンクがあり、過去release履歴だけに依存せず公式な確認経路を示せる。
- **署名blobの存在・公式リンクは、署名検証成功やtrust root承認ではない。** 対象署名のissuer/full fingerprint、primary/subkey結合・失効・期限・algorithmは未確認。公開鍵blobからのfingerprint算出も実施していない。
- 独立確認は未完了であり、全5項目Unknown、全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable/gate92、DER/absence停止を維持する。

今回、署名と公式公開鍵blobは上限付きHTTPSでメモリ内参照し、状態/長さ/hash/headerだけを記録した。鍵の保存・import・承認、署名検証、archive取得/展開、実装・本番cap投入・完成parts発行・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行は行っていない。担当者への連絡/送信・鍵server操作・DNS proof検証も行っていない。

## 2. 対象manifest署名の存在

以下は2026-10-24にAIが読み取り確認した応答。接続10秒/読取15秒、署名は64KiB上限、redirect追従なし、保存なし。Web読取ツールでは対象.ascを取得できず、許可された公式HTTPSのメモリ内読取で確認した。

| URL | HTTP / Content-Type | bytes | SHA-256 / header |
|---|---|---|---|
| [日付付き1.98.1 manifest署名](https://static.rust-lang.org/dist/2026-09-03/channel-rust-1.98.1.toml.asc) | 200 / binary/octet-stream | 801 | `a9fed69b47daaaf29a6207af9df13aedb66d502ab0acc4ea557602edf87fd1aa` / PGP SIGNATURE |
| [版付き1.98.1 manifest署名](https://static.rust-lang.org/dist/channel-rust-1.98.1.toml.asc) | 200 / binary/octet-stream | 801 | 同上 / PGP SIGNATURE |

2署名応答のhash一致は、2つの独立した署名者による証明ではない。同じ配布基盤の別pathである。対応manifest原bytesとの暗号検証もしていないので、対象manifestを正しく署名しているとはまだ判定しない。headerだけでpacket構造・signature algorithm・issuerを推定しない。

前回の[manifest原bytes/hash調査](BEST_PRACTICE_BP5_R2_OL03_MA02_VEC_SOURCE_ARTIFACT_REVIEW.md)と今回の署名を結合する際は、改めて承認済み手順で同じmanifest原bytesを明示して検証する。過去のhash値との文字列一致だけで署名有効へ昇格しない。

## 3. 署名鍵の公式な確認経路

確認日2026-10-24、確認者AI。以下は入手/問い合わせ経路の確認であり、鍵の用途・現在の所有・1.98.1への適用を人が承認したものではない。

| ID | 根拠URL・該当箇所 | 確認結果・適用限界 |
|---|---|---|
| ROOT-SRC-01 | [Forge: Other Installation Methods / Standalone installers](https://forge.rust-lang.org/infra/other-installation-methods.html#standalone-installers) | Rust build infrastructureによるGPG署名と、Rust signing key/Keybaseへの明示リンクを確認。表示stableは1.99.1で、standalone installerの説明。1.98.1 manifestの署名者との一致は別検証 |
| ROOT-SRC-02 | [Forge: Release Channel Layout / Channel manifests](https://forge.rust-lang.org/infra/channel-layout.html#channel-manifests) | manifest分離署名の説明を確認。文書は非規範的・不完全と明示されており、個別署名の検証結果ではない |
| ROOT-SRC-03 | [公式文書が参照する公開鍵](https://static.rust-lang.org/rust-key.gpg.ascii) | HTTP 200、5326 bytes、PGP PUBLIC KEY BLOCK header。SHA-256は`e54b09a439647e006b4831eec9785cbaaf3e07ab371c3a6ee6a68e1bdb9fbc6b`。このhashはblob指紋で、OpenPGP key fingerprintではない |
| ROOT-SRC-04 | [公式文書が参照するKeybase rust](https://keybase.io/rust) | 表示key ID `85AB96E6FA1BE5FE`、rust-lang.org/DNS等のproofへの導線を確認。完全fingerprint・proofの暗号検証・鮮度は未確認 |
| ROOT-SRC-05 | [Rust Infrastructure team](https://rust-lang.org/governance/teams/infra/) | CI/releases等を担当する公式窓口としてinfra@rust-lang.org、t-infra、Release teamのrelease@rust-lang.org/t-releaseへの導線を確認。連絡は未実施で、回答が得られる保証もない |

公開鍵URLの本文はWeb読取ツールではcontent-type制約で読めず、公式HTTPSで256KiB上限のメモリ内参照を行った。鍵を解釈/検証する製品コードや独自OpenPGP parserは作っていない。今回のPATHではgpgを検出できなかったが、端末全体の未導入を証明する全探索ではない。検証器を追加/設定していない。

[過去Release history](https://forge.rust-lang.org/archive/release-history.html)の範囲は0.1〜1.7.0であり、現行のROOT-SRC-01とは区別する。過去のforumログや検索結果に現れる長いfingerprintを、現在の承認値としてコピーしない。Keybaseの16桁key IDも、40桁等の完全fingerprintの代わりにしない。

## 4. fingerprintの独立確認方法（承認待ちの手順案）

**初回の信頼を同じdownloadへ循環させない。** 以下は方法の比較であり、いずれも今回の独立確認成功ではない。

| 方法 | 実施するときの証拠 | 独立性/限界と今回の状態 |
|---|---|---|
| 組織の既存trust台帳 | 今回の調査以前に確立されたRust鍵の完全fingerprint、承認者・確認経路・日時・失効/期限更新記録。別担当者が照合 | 既存台帳があれば優先。今回その台帳の有無・内容を確認していない。今回のblob hashを新規登録するだけでは不可 |
| 認証済みRust窓口への確認 | primary/signing subkeyの完全fingerprint、対象版/manifest digestへの適用、鍵更新・失効・期限・algorithmの説明を確認。回答者のrole/本人性を既知の別経路で確認して保存 | 公式teamページは連絡先の発見には使えるが、同じWebから得たアドレス宛の未署名mailだけで独立性を完了としない。事前に信頼した担当者/署名/別媒体の確認が必要。未連絡 |
| Keybaseのproof/sigchain | 公式文書から到達したprofileの完全fingerprintを、固定した信頼済み検証器で鍵blobから求めた値と照合し、proof/sigchain・domainとの結合と鮮度も検証 | 別サービスというだけでは独立trust rootではない。同じdomainのDNS/同じ管理主体への依存を評価する。今回はprofile表示/導線だけを確認し、独立経路とは認定しない |
| 公的な履歴/別媒体のwitness | 対象時期に存在した承認済み記録・出版/組織資料等の完全fingerprint、由来と改変耐性、現在の失効情報との対応 | 鍵server・ミラー・転載forum・検索snippetは発見用で、独立な所有証明ではない。今回利用可能なwitnessは確認できていない |

後続では、担当者が承認した検証器で公開鍵blobのprimary/subkey完全fingerprintを**importなし**で得る読取方法を先に固定する。抽出した値も、その時点では未承認候補と明示する。次に上記の独立経路と全桁照合し、対象署名の暗号検証から得たissuer/primary/subkeyとの結合も確認する。短いIDからfull fingerprintを補完しない。独自のfingerprint計算/packet実装を即席で信頼元にしない。

鍵のfingerprint一致だけでは不十分で、署名subkeyのbinding、許可用途、self-signature/署名hash方式、有効期間・失効情報の鮮度・信頼時刻も必要。古い真正鍵でも対象時点/現在の承認方針に合わなければ停止する。暗号policyを弱めて古い鍵を通す例外は設けない。

## 5. 人が確認する質問と承認票の未記入項目

将来連絡する場合の確認項目を以下に限定する。依頼の作成/送信は本作業では行わない。

1. 1.98.1/2026-09-03のmanifest署名に対する、公式に認めるprimary/signing subkey完全fingerprintと対応manifest digest。
2. static.rust-lang.org/rust-key.gpg.asciiとKeybase rustの鍵の現行用途・対象版との関係、鍵rotation/失効/期限・現在の確認先。
3. 完全fingerprintを別の既知/認証済み媒体でも確認できるか。署名を検証するための鍵を、同じ未検証署名だけで認証しない方法。
4. 許可algorithm/binding・署名対象形式に関する注意、過去鍵を扱う際の正式な運用方針。

承認票はprimary fingerprint/signing subkey、検証器、独立確認経路・回答者の認証、失効/期限/鮮度、承認者/期限の全てが未記入/未承認である。公開鍵blobのSHA-256や今回見えたkey IDを空欄の代用にしない。

## 6. 現在の到達点・停止条件・次の範囲

| 項目 | 状態 |
|---|---|
| 署名候補blobの存在 | 対象2 URLで確認済み、hash一致 |
| 公式な鍵配布/補助profile/問い合わせ経路 | 確認済み、対象署名への適用は未確認 |
| 公開鍵の完全fingerprint算出・対象署名issuerとの結合 | 未実施 |
| 独立fingerprint確認・鍵の有効性/失効/用途審査 | 未実施 |
| manifest署名の暗号検証・鍵承認/import | 未実施/未承認 |
| archive/member/installed artifact照合・layout証拠発行 | 未実施、進行不可 |

次は「importしない候補fingerprint抽出の検証器/手順」と「実際に利用できる独立確認経路」を承認前の案として具体化する範囲が適切である。独立経路が用意できない場合はTrustUnavailableとして止め、HTTPS/key ID/hashだけで承認しない。今回の調査はG0完了ではなく、archive取得・全体受付・parts/permitへの許可を与えない。
