# AP05 G02：ED06／ACK-36 同一候補で照合する通常経路と証拠台帳

Version: release-ap05-g02-ed06-ack36-candidate-path-evidence-map-draft-0.1 / Date: 2026-11-20。

Status: **現行sourceの静的照合・候補台帳案のみ。候補revision・digest・実解決先は未確定。候補での実行・単独欠失・非介在観測は未確認、観測手段は未承認。ED06の処遇・回復は未決定、外部利用はUnknown、閲覧0。G02未充足、SL01起動0。**

[外部資料に依存しない証拠取得案](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_INTERNAL_EVIDENCE_ACQUISITION_DESIGN.md)の候補側の照合点を具体化した。[開発用通常正対照](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_NORMAL_SOURCE_POSITIVE_RESULT.md)は現行の実session・実sourceで最初のmetadataまでの1件、[開発用owner対照](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_OWNER_REGISTRATION_CONTRAST_RESULT.md)は実owner関数と合成identityでの2件。両者は別run・別境界であり、同候補の正負対照ではない。静的基準 `32a24ae` は文書・sourceの参照であり、製品候補ではない。

## 1 構造照合：正常結果に先行する必須条件

同候補で確認するのは、関数名の存在ではなく、**通常entryで許可された入力から、同じ実体への呼出しと拒否時の短絡が保たれること**。下表の現行位置は候補JSで対応を読み直すための参照で、候補の実解決済み位置ではない。

| 照合境界 | 現行sourceで確認した順序 | 候補で差があれば止める例 |
|---|---|---|
| 通常entryと生成元 | [通常tool境界](../src/tools/best-practice.ts#L20) → [adapter](../src/review/update-set-adapter.ts#L87) → [通常client factory](../src/servicenow/client.ts#L153)でsession生成、通常2引数source。sessionは[内部生成したcore・snapshot・lease・owner](../src/servicenow/bounded-read.ts#L540)を結ぶ | 別factory、別root、旧開発wrapper・loaderへの解決。開発側[R2のfactory override](../src/review/r2-session.ts#L221)は通常候補の正対照にしない。現行packageの対象外宣言だけで実配布物から消えたとは扱わない |
| 正常releaseの返却 | [通常観測と設定fallback](../src/review/bounded-source.ts#L146)の正常成立は[completeRelease](../src/review/bounded-source.ts#L193)を共有。matchedの場合のみsource内のPermit／portを作り、[sessionの通常bind](../src/servicenow/bounded-read.ts#L632)が正常復帰した後に同Permitを返す。sessionはport取得失敗・ownerのfalseではthrow | 観測成功／設定主張経路の片側だけ、先行失敗を正常返却へ変える枝、別Permitの返却。非matchedやキャッシュ済みdecisionの再取得を、新しい登録成功とは扱わない |
| 登録の確定 | [ownerのbindSource](../src/servicenow/review-evidence-lifecycle.ts#L242)が同snapshot／lease、ready、portを検査し、`sourceBinding` と `sourceClaim` の確定後にtrue。失効が[登録を消去](../src/servicenow/review-evidence-lifecycle.ts#L58)することとは別 | 成功値だけで登録確定を判定、初期source結合やready生成と後段登録を混同、事後の空値で一度も登録されなかったと判断 |
| 最初のmetadata取得と拒否層 | [adapter](../src/review/update-set-adapter.ts#L120)の `matched → 同PermitのlistMetadata`。取得の前に[sourceのactive／Permit](../src/review/bounded-source.ts#L102)、[sessionのport](../src/servicenow/bounded-read.ts#L638)、[ownerのcheckと登録・ready照合](../src/servicenow/review-evidence-lifecycle.ts#L94)。最初の通常取得は[このguardの後](../src/review/bounded-source.ts#L224) | release段階のbind失敗やactive／Permit／port／予算の先行拒否を登録欠失と同視。外向きmetadataエラー、取得未到達、後段verifyのmetadataだけで最初の判定を確定 |
| 停止／終了 | [adapterの通常終了](../src/review/update-set-adapter.ts#L56)はoptional worker closeとsession closeを担う。sourceレベルの開発正対照はsession終了のみを確認した | sourceのcloseだけでadapter／runner／worker／stdio／cleanupを終端認定。実行不能や依存解決失敗を望みどおりの拒否に数えない |

## 2 候補台帳の受渡し（様式案、実値は未記入）

[G03の段階別pin](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)と[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)に従う。正対照・構造・負対照は別欄とし、P+（通常が通る）、P0（旧入口不在／拒否）、PΔ（検査の感度）は混ぜない。

| 欄 | 将来の記録・照合 | 現在 |
|---|---|---|
| 候補・検査器の指定 | 完全commit／tree、承認範囲、固定entry／入力・合成依存、独立検査器の版／digest、固定toolchain／許可されたローカル依存。空build → 同buildのpack → 同tarballの隔離展開を各出口で結ぶ | 未指定・未承認。現在のrepo `dist` は使わない。未生成のtarball digestを先取りしない |
| 実解決と構造 | 同じ展開manifestに対し、起点entry、importer、specifier、ESM条件、解決後の実体・内容pinを記す。それぞれの§1の成功・拒否に対応するJS分岐を記録。止めたら最初の根拠と未照合範囲を保持 | 現行sourceの位置のみ。候補JS、別名・転送や動的辺、実際のloadは未確認。名前・宣言・manifest一致だけで構造を確定しない |
| 通常正対照（SL09参照） | 同展開・同entry、通常合成入力で同sourceのPermitによる最初の取得、結果・会計・停止／解放・post-pinと終了を記録。guard前に追加の状態／時計／lease照会を挟まない | 現行sourceの別runの結果のみ。候補未実施。後段のguard、通常adapterの実行や旧保証の証拠へ広げない |
| 登録単独欠失と非介在観測 | 同候補の別fresh runとし、先行停止なし、正規Permit／port・同owner／readyの成立、登録だけ未確定、最初の通常guardに届いたが取得・dispatchへ進まないことを独立に記録 | 候補の適格な既存境界・観測手段は未確認。開発owner対照は補助のみ。既存SLやPΔに欠失runを割り当てない |

## 3 次の審査と停止条件

当面は**同一候補を指定できるように、変更範囲と検査器の対象entryを先に切り出す**。候補差分の作成・固定、候補実行、梱包・展開は別承認。現状はG01／G02・G03／G04の必要条件が揃わないため候補指定済みとはせず、起動0。古い梱包コマンドの実行や依存の外部取得で埋めない。

構造照合と通常正対照が揃っても、候補の登録単独欠失が直接観測できたことにはならない。現行の回復条件を保つ限り不足が解けるまでED06は保留。複数の証拠を組み合わせて再審査に出す場合は、受入条件と未代替の旧保証を別決裁し、非提供・回復・公開へ自動で進めない。

今回の変更は本MDのみ。実装・試験実行・候補指定・build／梱包・展開・コミット・公開・Push、外部照会・閲覧は行わない。旧試験・期限・閉鎖条件・全体受付無効・調査保留・閲覧0・候補起動0を維持する。
