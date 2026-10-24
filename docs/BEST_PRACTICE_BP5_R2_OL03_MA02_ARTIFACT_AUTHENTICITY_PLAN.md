# BP-5 R-2 OL-03 MA-02：公式manifest/archive真正性・installed artifact照合手順

Version: draft-0.1 / Date: 2026-10-24 / Source baseline: `3313c0d` / Status: 未実施の手順案。trust root・鍵・検証環境・上限は未承認

## 1. 目的・今回の非実施範囲

[A案調査記録](BEST_PRACTICE_BP5_R2_OL03_MA02_VEC_SOURCE_ARTIFACT_REVIEW.md) §4〜§5の不足を埋めるための将来手順を設計する。「署名された公式配布情報→archiveの圧縮bytes→member→installed file」を順に結び、各段階の成功と対象build/layoutの承認を分離する。

今回行ったのは公式の文書ページの参照とMD更新だけである。対象manifest/署名/鍵/archiveの新規取得・署名検証・展開・member照合は実施していない。archiveを取得/展開する以下の手順は**別途承認後に実施する案**で、実行用スクリプトではない。

5項目Unknown、全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable/gate92、DER/absence停止を維持する。実装・本番cap投入・完成parts発行・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行は行わない。既存toolchainの修復・更新・上書きも対象外。

## 2. 公式根拠と適用限界

確認日2026-10-24、AIによる本文参照。人による原文照合・手順承認は未実施。以下のURLは方式の根拠で、1.98.1の署名が現存/有効であることを証明しない。

| ID | 根拠URL・該当箇所 | 手順への反映と限界 |
|---|---|---|
| AUTH-SRC-01 | [Rust Forge: Release Channel Layout / Channel manifests](https://forge.rust-lang.org/infra/channel-layout.html#channel-manifests) | manifestにchecksumと分離GPG署名、版/日付付きURLがあるとの説明。ただし本文自身が非規範的・不完全と注意している。対象版の実在・署名対象bytesは後続で個別確認 |
| AUTH-SRC-02 | [rustup Security](https://rust-lang.github.io/rustup/security.html) | HTTPS利用と署名未検証を明記。rustup導入成功を独立した署名検証の代わりにしない |
| AUTH-SRC-03 | [Rust Forge: Release history冒頭](https://forge.rust-lang.org/archive/release-history.html) | 鍵への公式リンクがあるが、対象は0.1〜1.7.0の履歴。これを1.98.1の現行鍵/承認fingerprintの根拠に転用しない |
| AUTH-SRC-04 | [GnuPG: Configuration / batch・no-tty](https://www.gnupg.org/documentation/manuals/gnupg/GPG-Configuration-Options.html) | 無人実行・機械判定の入口。コマンド終了0だけを業務上の信頼判定にしない。採用検証器の固定版/安全な設定は別承認 |
| AUTH-SRC-05 | [GnuPG DETAILS: status records / VALIDSIG等](https://raw.githubusercontent.com/gpg/gnupg/master/doc/DETAILS) | 暗号検証結果と完全fingerprintを機械判定する資料。masterは可変なので、実装時は採用版の仕様を固定して対応レコードを審査する |

同じHTTPS配布元から得たfileとchecksumの一致は転送整合性であり、承認済み署名鍵との暗号検証とは別。公開鍵も同じ経路から初めて得ただけなら信頼の起点は解決しない。GitHubのsource hash/docs一致、macOSのコード署名、一般の鍵UID表示も代替にならない。

## 3. 信頼元の承認（G0：これが未了なら開始しない）

承認責任者と検証担当者を分け、少なくとも次を記載した固定の承認票を用意する。具体的fingerprint/鍵blobは今回指定・承認しない。

- 対象release=1.98.1、日付候補=2026-09-03、target候補=aarch64-apple-darwin、componentsと圧縮形式。これらは前回観測の候補であり、署名済みmanifestで再確認する。
- Rust配布署名者に属することを確認したprimary keyの**完全fingerprint**、許可するsigning subkeyの完全fingerprint/結合証明、鍵blobのdigest、用途・許可暗号/署名hash方式。
- 鍵の初期入手経路と、別の信頼経路によるfingerprint確認の根拠。組織が既に管理する検証済み鍵台帳や、Rust側の認証済み窓口での確認等を責任者が承認する。2つのURLを読むだけで独立経路と呼ばない。
- 鍵/署名の有効期間・失効情報の取得日時と信頼元、確認票の期限、信頼する現在時刻。失効情報の鮮度条件を数値で承認できなければ未確認で止める。
- 検証器・依存library・OSの固定版/digest/由来、対象仕様、専用公開鍵ring/作業領域の保護、制限値、レビュー担当。
- 承認する版/digest/targetとrollback制約。署名の自己申告時刻やmanifest内dateだけではfreshnessを証明しない。古い真正な配布物も無条件に受け付けない。

鍵の更新/失効/不明なsubkeyは新しい承認が必要。メールアドレス・短いkey ID・検索順位・初回表示の自動acceptで補わない。期限切れの旧署名を扱う歴史検証の例外は今回設けず、必要なら別設計とする。TOFUや「鍵を取れなければhashのみ」へのfallbackは禁止。

## 4. 固定順序と失敗時停止

G1以降はG0と実施範囲の承認後にだけ行う。全工程に共有deadline/取消を置き、失敗後は後続phaseへ進めず、最初の理由とcleanupの成否を分離して保存する。以下のreasonは調査票用の分類案で、製品Failure enumへの追加ではない。

| Gate | 将来の確認手順 | 停止条件の例 |
|---|---|---|
| G1 固定取得 | 承認された版/日付のmanifest原bytes・分離署名をHTTPSで取得。host/path/証明書検証を固定、redirect/鏡像/可変stableへ自動切替しない | 取得不能、対象変更、上限、deadline/取消はFetchRejected。署名欠落はSignatureUnavailable |
| G2 暗号検証 | 専用の隔離公開鍵ringで、署名とmanifestを明示して分離署名検証。個人keyring・secret key・agent・鍵server/WKD/自動鍵取得・対話は使わない。networkなしの検証環境を前提にする | 不正/未知鍵、失効/期限/鮮度不明、非許可algorithm、検証器失敗はSignatureRejected/TrustUnavailable |
| G3 署名結果の承認照合 | 機械statusとexit、primary/subkeyの完全fingerprint、承認票・現在時刻を照合。対象manifest原bytesのdigestを保存 | Good signatureという人向け文面/exit0だけでは不可。不一致・失敗status・不正/過剰出力は停止 |
| G4 manifest意味検査 | 暗号検証済みの**同じbytes**をstrict bounded TOMLとして解析。重複key・構造不正を拒否し、release/date/component/target/available/選択圧縮形式/URL/hashを承認票へ結合 | 版違い、対象なし、available=false、未知構造/曖昧URL/digestはManifestRejected |
| G5 archive hash | 選択した1 archiveを隔離領域にbounded取得し、圧縮bytes全体のSHA-256を署名済みmanifestの対応hashと照合。gzip用hashとxz用hashを混ぜない | 不一致/短縮/超過/差替えはArchiveRejected。照合前に解凍・installer実行しない |
| G6 member検査 | 同じ検証済みarchiveを保持してboundedに走査。固定component/layout解釈に基づきmember一覧と期待bytes/digestを作る | 未対応形式、危険path/type、重複、余剰/欠落、展開上限はArchiveLayoutRejected |
| G7 installed照合 | 更新を停止したsnapshot/保護読取から、固定の配置写像で相対path集合・size・bytes/hashを照合 | 取得失敗/不一致/集合差/途中変更/非正規file等はInstalledMismatch/Changed |
| G8 記録と終了 | 範囲を限定した照合票を保存し、全一時resourceの解放/終了を確認。成功でもbuild/layout/permitへ変換しない | 後始末未確認はCleanupIncompleteを併記し、成功票を発行しない |

manifestの`.sha256`も整合補助として照合するが、G2〜G3を省略しない。署名対象は受信した原bytesで、改行やTOML順を正規化してから署名検証しない。ローカルmultirust-channel-manifestの対象キー一致だけでは公式原bytesの署名を引き継げない。

archiveの個別`.asc`の存在・方式は未確認。存在する場合は同じ承認方針で補助照合できるが、任意鍵の個別署名でG2〜G4を迂回しない。本案の基本連鎖は承認鍵→manifest分離署名→その中のarchive hashである。

### 4.1 署名判定の具体条件案

採用するGnuPG版のstatus仕様を固定し、VALIDSIG等の検証情報からsigning key/primary keyを承認票に照合する。未知レコードの扱いは採用版の互換規則として明示し、失敗statusや判定必須情報を無視しない。初期subsetは承認した1署名だけを要求し、複数署名/未対応署名形式は自動採用しない。

BAD/ERR/NO_PUBKEY、失効/期限切れを示す状態、承認外hash/鍵/署名者、解析不能、出力途切れ、子process異常/timeoutを拒否する。ユーザーkeyringのownertrust値を承認fingerprintの代わりにしない。公開鍵ringを作る手順自体も承認が必要で、今回importや設定変更は行わない。実装前に実status fixtureと独立oracleで成功/拒否条件を確認する。

## 5. bounded取得・解釈・隔離の設計条件

検証対象を信頼する前のparser/decompressorも攻撃面である。以下は**未承認の試験用上限案**であり、production cap・既存モデル値・実archiveの適合確認ではない。承認されるまでは取得工程を実施しない。超過時に自動で拡大/圧縮形式変更しない。

| 対象 | 初期の有限上限案 | 追加条件 |
|---|---|---|
| manifest / detached signature / 公開鍵blob | 2MiB / 64KiB / 256KiB | それぞれ独立、署名/鍵のpacket数・深さも採用parserで有限化して承認 |
| archive圧縮bytes / 展開総bytes | 512MiB / 4GiB | Content-Lengthを信頼せず実受信/展開bytesを課金。decompressor内部window/dictionary・memory/CPUも別上限 |
| member数 / 1 member bytes | 100000 / 512MiB | directory/metadata recordも数える。size合計/offsetはchecked算術 |
| 相対path / 深さ | UTF-8 1024 bytes / 64段 | NUL・制御文字・絶対/drive path・空/./..成分・重複正規化を拒否 |
| 全体 / 子process | 全体10分 / 各30秒以内かつ残予算以内 | 待機・hash・展開・解放も対象。出力は各8MiB以下、途中停止を確認 |

上限案が実配布物と合わない場合は拒否結果を残して再設計する。多数componentを一括する前提にはせず、使用する包単位/総量/同時最大数を承認する。検証作業自体のscratch・FD・cleanup用予算も別に確保する。

将来の隔離領域は非公開・他者書込不可とし、symlink/hardlink・device/FIFO・sparse・未対応拡張/PAX/GNU形式・非正規重複・case/Unicode正規化衝突を拒否する初期subsetとする。対応が必要なら事前に別承認する。メタデータを信頼する前に外側へ書き出さず、owner/setuid/ACL/xattrをarchiveから適用しない。install.shやarchive内binary・build scriptは実行しない。

raw tar memberからinstalled相対pathへの写像は、認証済み包の固定component manifestと、対象版installer/layout仕様を照合して定義する。文字列prefixを無条件に削る、任意manifestのpath指示を実行する、shell installerを走らせて観測する方式は採らない。この写像と対応subsetはまだ未調査であり、決まらなければG6で停止する。

## 6. installed artifact照合と差替え対策

既存toolchainは読み取り専用とし、照合失敗を自動repair/reinstall/updateしない。実施前に、更新停止/排他と同時書込のないsnapshotを確保する責任者・方法を承認する。協調lockだけでは非協調writerを排除できず、前後stat/hash一致だけで全体の原子的snapshotを証明しない。保証できなければ「安定snapshot未確認」で止める。

将来の読取はdirectory FD基準・no-follow・同一保持FDでmetadata→bytes/hash→metadataを結合し、祖先/path・file identityの再照合も行う。閉じたpathを再openして同じfileと推定しない。読取byte数・列挙/再検査回数・共有deadline/取消を制限する。これは今回の製品secure openerを接続する許可ではない。

照合単位は少なくとも使用するcore/alloc/stdのrlib/rmetaと依存artifact集合。前回の代表6 fileのhash一致だけで完了にしない。rust-std専有範囲では期待集合との完全一致を求め、共有directoryでは別component所有のfileを任意に無視せず、認証済みcomponent所有表とのunionで説明する。所有未確定の余剰・競合・欠落は停止する。

installed component manifestは期待値の信頼元にしない。archive由来の写像との一致を検査する対象とする。内容hashは同一bytesを比較し、tar側owner/mtime/modeをローカルへそのまま要求/適用しない。ローカルpermission/ACL/xattr/FSは既存配備方針による**別の安全性検査**で、内容一致がこれを省略しない。archiveから生成/変換されるfileがあるなら、無説明の例外にせず固定変換recipeと証拠を要求する。

stdのmember一致が得られてもcompiler/cargo/linker/SDK、features/cfg・最適化・allocator shim・最終binaryの対応は未証明。Vecのgenericコード/monomorphizationのため、rmetaを含めたtoolchain/build入力の結合と信頼済みbuild由来を別工程で満たす。

## 7. 証拠票・失敗時の扱い

証拠票には承認票ID/版、検証器版/digest、信頼時刻、許可fingerprint、manifest原bytes/hash・署名hash、選択component/target/URL/圧縮形式/hash、archive実hash、member/installed集合digestと件数、各gateの結果、最初の拒否stage、cleanup/終了確認を保存する案とする。公開鍵は秘密ではないが、人名/UIDや任意stderrを無制限に出さず、固定reasonと許可fieldのみ報告する。

不一致fileの中身を表示しない。既存6 file等の自己観測digestを「正解」として昇格せず、照合結果を上書きして成功に直さない。途中まで成功しても最終成功へ変換せず、未到達gateを未実施として残す。解放失敗・子process終了未確認は先行理由を消さず併記し、後続処理は禁止する。

履歴は対象版/digestに固定して保持し、鍵rotation・失効・trust更新時は旧証拠の適用可否を別審査する。rollbackも承認済みtuple全体で行い、古い有効署名だけで戻さない。最終照合票は配布bytesとの対応記録であり、VerifiedModuleLayout・cap承認・完成parts・permitを発行しない。

## 8. 未確認・実施前の承認チェックリスト

- 対象1.98.1 manifestの`.asc`の存在、署名者・primary/subkey fingerprint、現在の失効/期限/algorithmと信頼経路。
- 使用するGnuPG等の検証器版/由来・完全なstatus判定仕様、鍵ring/検証環境/制限の承認。
- 既存ローカルmanifest全体の差分原因。対象キー一致で差分を説明済みにしない。
- 実archive形式・member layout・installer manifestの固定版/配置写像・安全な解釈subsetと上限適合性。
- installed toolchainの更新停止・安定snapshot・所有表、metadata/xattr方針、全component閉包の照合範囲。
- 失効情報の鮮度・承認期限・信頼時刻・証拠保存先/権限・cleanupと終了確認、責任者の指定。
- source↔配布artifact生成元↔対象buildの残る由来証明。member一致だけで再現build/attestationを取得したとはしない。

以上が未承認のため、次の安全な範囲はtrust root/鍵確認経路と対象署名の確認計画を絞ること。archive取得/展開・署名検証の実施は別途承認を待つ。Unknown・全体受付無効・telemetry保留は継続する。
