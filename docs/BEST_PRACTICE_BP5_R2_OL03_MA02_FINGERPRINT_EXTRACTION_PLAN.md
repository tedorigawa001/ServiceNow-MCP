# BP-5 R-2 OL-03 MA-02：importしない候補fingerprint抽出・独立確認経路

Version: draft-0.1 / Date: 2026-10-24 / Source baseline: `f59668e` / Status: 未実施の手順案。検証器・隔離環境・独立経路・鍵は未承認

## 1. 目的・境界

[trust root確認経路調査](BEST_PRACTICE_BP5_R2_OL03_MA02_TRUST_ROOT_INVESTIGATION.md)の次工程を具体化する。ここでいう抽出は、公開鍵blobからprimary/subkeyの完全fingerprintを読み、**未承認候補**として記録する操作。署名検証・Rustへの帰属確認・有効性審査・鍵の承認とは別である。

「importしない」は永続する公開/秘密鍵ring・trust DBへ鍵/信頼を登録しないこと。検証器の内部メモリでの解釈や、隔離用一時領域の存在までゼロと主張しない。show-onlyという名前だけで無副作用を保証しない。

今回行うのは公式文書の参照とMD更新のみ。対象鍵/署名の再取得・抽出実行・検証器の導入/起動・鍵承認/import・archive取得/展開・担当者への連絡を行わない。実装・本番cap投入・完成parts発行・通常strict差替え・OS接続・実機操作・token発行・設定変更・permit発行も含めない。5項目Unknown、全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable/gate92、DER/absence停止を維持する。

## 2. 検証器の選択案と公式根拠

**第一候補は、信頼済み配備で版とdigestを固定したGnuPGの`--show-keys`。** 製品に組み込む選択ではなく、将来のoffline調査用である。採用するpatch版・配布元・実行binary/libraryの期待digestは未決で、PATH上の任意gpgを実行しない。前回PATHでgpg未検出のため、現端末で利用可能/導入済みとも扱わない。

| 根拠URL・該当箇所 | 今回確認した意味と制限 |
|---|---|
| [GnuPG Operational commands: --show-keys](https://www.gnupg.org/documentation/manuals/gnupg/Operational-GPG-Commands.html) | 入力OpenPGP鍵の情報を表示し、機械処理にはwith-colonsを推奨。list-packetsはdebug用途で出力形式も可変なので採用しない |
| [GnuPG Input/Output: show-only](https://www.gnupg.org/documentation/manuals/gnupg/GPG-Input-and-Output.html) | show-only/dry-runとshow-keysの関係を説明。永続登録しない用途の入口だが、全filesystem/network副作用の証明ではない |
| [GnuPG Configuration: batch/no-tty](https://www.gnupg.org/documentation/manuals/gnupg/GPG-Configuration-Options.html) | 無人表示と機械判定の方針。固定版のoption対応・実動作を別途検証する |
| [GnuPG DETAILS: colon listings / fpr](https://raw.githubusercontent.com/gpg/gnupg/master/doc/DETAILS) | pub/subのfingerprint情報とfield 10を確認。masterは参照用で可変。採用版の仕様/sourceを固定して記録契約を決める |

確認日2026-10-24、AIによる原文参照、人による仕様承認は未実施。今回は正確なpatch版/署名付き配布物の採否を決めない。検証器自身の真正性を対象Rust鍵だけで循環認証しない。組織が既に信頼する配布/管理基盤か、別途承認された検証器取得経路が必要。

他のOpenPGP実装による独立抽出は将来の補助試験にできるが、今回は追加採用しない。2つの計算器が同じfingerprintを返しても、それは計算の整合性であってRustが所有する鍵だという独立確認ではない。Webのkey ID、鍵blobのSHA-256、独自packet parserによる即席計算は代替にしない。

## 3. 実行前の固定条件（現在は未承認）

1. 責任者が検証器の版/digest/source・依存library・対象OS、採用版manual、許可optionとrecord集合を承認する。未導入なら勝手に追加せず停止する。
2. 実行環境はnetworkを外側で禁止し、専用の空home/作業領域と公開入力だけを与える。個人HOME/GNUPGHOME・鍵ring・trust DB・agent socket・資格情報・他のworkspaceへアクセスさせない。loader/proxy/追加option等を注入するenvも引き継がない。
3. 概念上のoption集合は、先頭の`--no-options`、専用`--homedir`、`--batch`/`--no-tty`、`--no-default-keyring`、自動鍵取得/自動trust DB検査/agent起動の禁止、`--with-colons`とprimary/subkey両方のfingerprint表示、`--show-keys`。正確な組合せ・重複fingerprint指定の挙動は採用版で固定する。これは未実行のargv設計であり、貼付け実行用commandではない。
4. 操作はshow-keysだけとし、import/receive/locate/refresh/send/export・鍵生成・ownertrust変更・署名/検証commandを混ぜない。入力は固定FD/明示file一つに限定し、メールアドレスによる鍵探索や利用者指定optionを受け付けない。
5. 本番候補鍵ではなく独立した合成fixtureを使い、鍵ring/trust DBの新規生成/更新、network・agentへの接続、外側homeへのアクセスがないことを事前検査する。内部の一時fileが必要なら明示許可したscratchだけに限定する。対応できなければUnavailableとし、禁止optionを外して継続しない。

no-default-keyring等だけをsandboxの代わりにしない。read-onlyな専用環境で検証器が起動できなければ、原因と必要scratchを設計へ戻し、個人環境へ切替しない。今回これらの環境/制限を作成・設定していない。

## 4. 候補抽出の固定手順案

| 段階 | 将来行うこと | 出力/停止条件 |
|---|---|---|
| F0 準備 | §3の承認、空環境、外側deadline、cleanup責務を確認 | 未承認/未隔離は実行しない |
| F1 入力固定 | 公式経路から得た公開鍵blobの取得URL/日時/byte数/SHA-256を記録し、同じ不変bytesを検証器へ渡す | 前回hashとの違いを即改ざんとは決めないが、未説明の変更として停止。再取得/鍵更新は別審査 |
| F2 offline表示 | 固定binary/argvでshow-keysを実行。入力以外の取得や対話は拒否 | exit非0、timeout、出力超過、禁止アクセス/副作用、終了未確認で停止 |
| F3 構造照合 | colon recordの種類・順序・件数・完全fingerprintを解析 | 欠落/重複/曖昧なpub/sub対応や秘密鍵recordで停止 |
| F4 限定記録 | 入力digestと検証器digest、primary/subkey候補、報告metadataを保持 | authorityは常にcandidate_unapproved。UID本文や任意stderrは表示しない |
| F5 終了 | child終了・scratch廃棄・外側環境不変を確認 | cleanup/副作用が未確認なら成功扱いにせず診断を保持 |

初期の試験用上限案は入力256KiB、primary 1、subkey最大16、colon record最大512、1行16KiB、stdout/status/stderr各1MiB、全体30秒。採用parser内部のmemory/CPUも外側で有限化する。値は未承認で、本番capや実鍵の適合性を確認した数字ではない。上限超過/未対応で止め、拡大・切捨て・最後の1鍵採用で補わない。

## 5. recordと限定確認票の契約案

- `pub`に結び付く`fpr`をprimary、各`sub`に結び付く`fpr`をsubkey候補として、採用版の仕様に従い対応させる。離れたfprをkey IDの末尾一致だけで割り当てない。完全fingerprintはfield 10から取り、公開鍵blobのhashとは別fieldにする。
- 初期subsetは完全な40 hex形式のfingerprintだけを扱う案とし、他の長さ/形式は未対応として停止する。全てのOpenPGP版に40桁を要求する規格とは主張しない。`fp2`等を`fpr`の代用にしない。大小文字以外の補正/切詰め/欠落補完は禁止する。
- primaryはexact 1、各keyに必要なfprがexact 1、subkey重複なしを要求。`sec`/`ssb`等の秘密鍵record、複数primary、主従対応不明、切れた出力を拒否する。uid等の不要な可変recordも上限へ数え、採用版の許可record規則を先に固定する。未知recordを無条件に無視しない。
- algorithm/作成/期限/能力/失効等は「検証器が報告したmetadata」として分ける。表示成功をself-signature/bindingの暗号検証成功や、現在の失効情報取得済みと解釈しない。失効/期限切れ等の表示は後続を止める理由とし、policyを弱めて通さない。
- 結果案は`input_blob_sha256`、`verifier_build_digest`、`primary_fingerprint_candidate`、`subkey_fingerprint_candidates`、`reported_metadata`、`extraction_status`、`authority=candidate_unapproved`、`independent_confirmation=not_performed`、終了/cleanup結果。成功でもregistry値・policy・partsへ変換するfieldは持たせない。

この確認票は設計のみで、JSON schema/serializer/parserは実装しない。今回候補fingerprintの値は記入しない。対象manifest署名のissuer照合/暗号検証は、trust rootと検証手順が別途承認された後の工程である。

## 6. 独立確認経路の利用可能性と選択順

2026-10-24時点の読み取り確認では、[公式team窓口](https://rust-lang.org/governance/teams/infra/)と[Forgeの鍵参照](https://forge.rust-lang.org/infra/other-installation-methods.html#standalone-installers)、[Keybase rust](https://keybase.io/rust)へ到達できる。これは公開経路の利用可能性であって、**現時点で独立確認済みとして利用できる経路は0件**。組織内の台帳・既知担当者の有無は調査していない。

| 優先 | 候補経路 | 利用開始に必要なもの | 現在の扱い |
|---|---|---|---|
| 1 | 組織の既存trust台帳/管理者のwitness | 今回より前に確立された完全fingerprint、記録の真正性/承認者、現行用途・失効/期限更新、別担当者による全桁照合 | ユーザー/責任者から存在と参照権限の提示を待つ。秘密や個人鍵を要求しない |
| 2 | 既知で認証済みのRust関係者経由 | 事前に信頼した相手/媒体、role確認、対象版/digestとprimary/subkeyの結合、回答の保存・期限 | 利用できる既知の関係があるか未確認。連絡は行わない |
| 3 | 公式Infrastructure/Release窓口への照会 | 公式窓口への到達と、返信者を別の既知経路で認証する方法。未署名mailの表示名/Fromだけは不可 | 公開連絡先は確認済みだが、返信経路の独立性は未確立。送信は別途許可が必要 |
| 補助 | Keybase proof/sigchain、公式source/docs、公開履歴 | 検証器とproofの結合/鮮度、過去の信頼済みcheckpointや別媒体のwitness、共通管理障害の分析 | 公開profileは参照可。表示key ID・別domain・同じRust DNS proofだけでは独立性を認定しない |

選択は「2 URLが同じ値」ではなく、どの障害/攻撃を分離できるかで行う。例えば配布CDN改変への対照として、事前に別管理下に保存された承認台帳は役立ち得る。一方、同じdomainのWeb/DNSや初回のKeybase proofだけではRust側identity全体の侵害を独立に排除できない。2つの抽出ソフトの一致はparserの誤りへの対照に留まる。

どの候補にも、対象primary/subkeyの全桁、対象1.98.1/manifest digestとの関係、確認者/role・認証根拠、取得時刻/失効情報の鮮度、期限を必要とする。複数資料が食い違った場合は多数決/最新表示で採用せず、TrustUnavailableとして差分を保持する。既存台帳の提供も連絡も無い間は、候補抽出だけを終えてもG0は未完了である。

## 7. 実行前に確認する事項と次の範囲

1. 責任者が利用できる既存trust台帳/既知の独立媒体を提示できるか。未提示のまま独立確認成功を目標に進めない。
2. 信頼済み環境で使える検証器の版/digest・依存closureと、importしない動作/副作用制限をどう検証するか。
3. 正常・複数鍵・秘密鍵・欠落/重複fpr・超過/期限・失効表示・新形式・禁止アクセスを含む合成fixtureと期待する限定結果。試験そのものも今回は未実装/未実施。
4. 記録の保存先・権限、承認者/期限、実行/新規取得/連絡の許可を個別に得ること。

今回の完了はMD設計まで。次の候補は「採用検証器の固定版と入手済み信頼元、隔離試験の実施範囲」を定めることで、検証器の導入や実鍵抽出の許可ではない。独立経路が用意できなければ停止を維持し、鍵承認・archive・layout issuer・全体受付・parts/permitへ進めない。
