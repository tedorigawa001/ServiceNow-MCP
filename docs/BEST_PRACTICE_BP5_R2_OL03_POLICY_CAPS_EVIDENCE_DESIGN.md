# BP-5 R-2 OL-03：PolicyCapsEvidence・詳細設計

Version: draft-0.1 / Date: 2026-10-23 / Source baseline: `22d5757` / Status: MDのみ。内部型・cap承認・bootstrap統合・運用受付は未実装/未承認

## 1. 範囲と停止状態

[供給証拠設計](BEST_PRACTICE_BP5_R2_OL03_SUPPLY_EVIDENCE_DESIGN.md)のPolicyCaps段階を具体化する。承認された上限、検証済み宣言から導出した必要量、実際に配賦するResourceInput/Quotasの3つを分離する。数量が小さいこと、model IDの一致、同じsealの存在だけをcap承認へ昇格しない。

全体受付無効・telemetry保留・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。実装、通常strict差替え、OS接続、実機操作、token発行、設定変更、本番policy投入、permit発行を含めない。本書の型名/API名/追加費目は案であり、存在する実装の説明とは区別する。

全体の消費順はContext→Records→HeldSources→**PolicyCaps→ScanSlots**→公開前checkpoint。先行実装のScanSlotsCheckedはPolicyCaps未確認の独立fragmentであり、本段階の入力や完了証拠の代わりにはしない。

## 2. 照合した現行契約

| 実装 | 現状 | 設計上の不足 |
|---|---|---|
| [resource_model.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/resource_model.rs) | resource-0.2、固定kernelとの照合、9算術行、round/session数量・共有retry/tail・xattr上界 | raw Shapeは承認済み宣言の証拠ではない。policyを発行しない |
| [resources.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources.rs) | session/roundの5分類・total・live・namesを二重検査、cleanup予約・内部配賦 | ResourcePolicyの本番constructorなし。configureのmodel検査は承認/必要量検査の代替ではない |
| [session.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session.rs) | ResourceInputを一度configure、唯一session claim・3round順序 | 生成にはsession claim開始が必要だが、供給証拠検査は開始前。段階を分ける必要がある |
| [profile.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile.rs) | 同ScanInputs/RoundScope/budgetへの借用、profile claim、count-only統計 | scope外へ移せない。resource必要量への保護されたprojectionはない |
| [calculator.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/scan_inputs/profile/calculator.rs) | profileを値で消費しScanWorkEstimateに保持 | 同profileからresource計算も行う口はない。raw summaryで代用不可 |
| [RoundDeclaration](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration.rs) | 1round 1decode、同scope内で意味検査再利用 | decoded bytesとscopeを借用し、別round/移動後ownerへtreeを持ち出せない |

[3round資源設計](BEST_PRACTICE_BP5_R2_OL03_THREE_ROUND_RESOURCE_LEDGER_DESIGN.md)と[全体work設計](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md)を維持する。既存configure成功や合成testing::Policyから承認capを作らない。

## 3. 承認capの信頼元

初期案は**信頼済みbuildに固定された単一のcap registry entry**とする。将来の`APPROVED_RESOURCE_CAPS`相当は承認完了までNone。呼出し引数、env、任意path、instances.json、計算器の出力からcapを上書きしない。本書は設定ファイル形式/署名方式/数値capを新設・承認しない。

信頼済み配備の署名・閉包・registry整合検査を通った固定発行moduleだけがApprovedCapsを発行する。人が承認したcap原票からレビュー済みbuild artifactへ反映する手順は別承認。hashや「approved:true」という文字列だけでは信頼元にならない。署名policy registryとresource cap registryは用途が異なり、自動変換しない。

承認原票には少なくとも次を固定する案とする。

- approval ID/revision、責任者による承認記録の参照、適用build/配備系列、発効/期限、失効時の配備停止手順。
- cap原票とModelBundleの固定digest、対象role/backend、resource/profile/kernelと全体費目の対応版。
- bootstrap用の限定cap、scan session/round用cap、外側ownerを含むrole全体の独立resource余裕。
- 各値の単位・適用範囲・有限上限、未対応dimension。未知項を0/無制限/既定値で補完しない。

capはclock検証済みの同RecordSource/inspectionから得る時刻へ照合する。`valid_from <= verified_wall`、`expires_at > verified_wall + 元10秒期限までの残時間`をchecked算術で要求する案。wall/monotonic整合が不明なら停止する。AI/caller申告の時刻や、期限を延ばすための新startedは使わない。初回clock検証の型付き出力を再利用する接続が必要で、現状は未実装。

この方式は固定build/承認snapshotの検証であり、オンラインの即時失効確認ではない。失効検知・配備停止の責任者/更新経路/保証範囲と期限値は承認待ち。対応できない要求がある場合はcapを投入せず停止する。

## 4. 型・発行元・所有権（すべて案）

| 型案 | 発行元/責務 | 所有・結合 |
|---|---|---|
| ApprovedCaps | 信頼済み固定cap registry module | cap原票/ModelBundle/buildのidentity・適用範囲・期限。raw数値constructorなし |
| BootstrapScope | 同registryと唯一inspectionの限定準備入口 | 元budget/started、許可するdecode/統計収集だけの上限。scan/ResourceInputへ変換不可 |
| ResourceRequirementWitness | 初回の検証済みprofile/estimate専用module | 同receipt/lineage/index bytes/target/context、Initial scope/token、profile origin、retry snapshot、全必要dimension |
| PolicyCapsEvidence | 専用cap検査module | ApprovedCapsとRequirementWitnessの照合済みidentity、同held/source系列、未使用ResourceInput/Quotas3個の供給identity |
| PolicyCapsChecked | 証拠の固定消費口 | 次のSlots検査へ渡す一度限りの段階。scan開始/全体受付/permitではない |
| PolicyAllocationParts | resources専用module | 承認capを写したResourceInputとround別Quotas。issuer/slot結合、非再発行 |

型はprivate field・非Clone/非Copy/非serde・opaque Debug。発行元以外の`new(raw, approved)`、任意trait factory、診断summaryからの再構築はない。必要量Witnessも計算結果をwrapperへ入れるだけでは発行しない。元の検証済み値との由来を検査する。

予算側にpolicy証拠のissued/used、配賦partsの一度限り移譲claimを持たせる案。各試行は最初のfallible処理より先に消費し、drop/失敗/別issuer構築で回復しない。別budgetへの持込みは提示側と元claimを停止する。

cap原票と配賦値はimmutable保持領域へ結ぶ。receipt/対象bindingは元lineageと完全値、同context/held/source供給系列を要求する。同digestでも別owner/世代/roleは代替不可。初回round tokenは必要量の発行由来に使い、BeforeM4/AfterM4へ同tokenを再使用させない。後続roundは同session policyに対し、そのroundのfresh scope/token/profileを再検査する。

## 5. ModelBundleとprofileの保護projection

許容ModelBundleはcap原票が指定する固定の組合せ1つだけとする案。ID比較に加え、対応build artifact/係数・課金点・許可名/上限・phase所有表の版を固定し、部分的に新旧を混ぜない。

| 部品 | 現行ID（本書で変更しない） |
|---|---|
| record / index / index phase | bp5-r2-record-work-0.1 / bp5-r2-index-work-0.1 / bp5-r2-index-phase-work-0.1 |
| profile / calculator / kernel | bp5-r2-scan-profile-0.1 / bp5-r2-collector-work-0.2 / bp5-r2-collector-work-0.2 |
| collector entry / session entry | bp5-r2-collector-entry-0.2 / bp5-r2-session-collector-entry-0.2 |
| resource quantity / xattr names | bp5-r2-scan-resource-0.2 / bp5-r2-scan-xattr-names-0.1 |
| session state / allocation | bp5-r2-scan-session-state-0.1 / bp5-r2-session-allocation-0.1 |

cap registry、requirement witness、PolicyCapsEvidenceのmodel IDは新規契約案で、実装前に固定する。現在の試験専用scan backendは本番ModelBundleに入れない。未知model/未承認bundleはUnavailable。ID文字列が同じでもsource/係数・allowlist契約が変わったものを認めない。

resource必要量は同ScanShapeProfileを保持するScanWorkEstimateから、専用の借用口で導出する案。現行calculateがprofileを消費することを無視して複製/再buildしない。Witnessを借用する検査を終え、その借用を閉じてから元estimateを固定collectorへ一度だけ消費する。round lifetimeをunsafe/ポインタ保存で延長しない。

既存Shapeへの対応はentries=e、files=f、directories=d、root_depth=h、edges=k、chunks=c、bytes=l。virtual indexを含め、Dはrootを含まない。scalar域だけでなく同宣言の各file上限・path/metadata規則を検証した由来も必要。raw Shape、IndexWorkSummary、実行済みdelta、旧評価fixtureを受付入力にしない。

## 6. 必要量と承認capの比較

同初回profileと元retry残r0からresource-0.2を実行し、checked算術で次を照合する。3roundは同index/世代に結び、変われば既存strictで停止する。後続fresh profileが小さくても台帳を再作成/増額しない。

| dimension | 必要条件 |
|---|---|
| 5分類attempts | 各round cap[j] >= quantities.round[j]、session cap[j] >= quantities.three[j] |
| total attempts | 各round total >= round_total、session total >= three_total。分類別cap和とtotalを同一視しない |
| live/cleanup予約 | scan round/session live >= peak_owners。各acquire前に使用中＋live予約、cleanup実消費＋cleanup予約を両台帳で検査 |
| xattr名bytes | 各round names >= xattr_round、session names >= xattr_three。round上限の和をsession必要量へ使わない |
| payload/retry | 元SharedBudgetのused/reserved/retriesを共有。A/B・record・3scan・EOFを重複なく含む残必要量が元残へ収まること |
| role全体/管理量 | 外側held ownerとscan peak、record/topology temporary、profile/tree/配列/部分所有/解放の同時量が承認された独立cap内 |

round必要量はretry/tailが1roundへ集中する場合を含み、sessionは共有分を一度だけ含む。3×roundをsession量へせず、round側の余裕からretryを補充しない。resource_modelのthree_totalは分類ごとの異常tailを全部同時発生と仮定した和ではないので、別々に比較する。

xattr上界は許可名が最大21 bytes、非許可ならsticky停止する同モデルの前提に結ぶ。最大copy1回を含むsession式を用い、allowlist/停止挙動が変わったら改版する。directory列挙buffer bytesはxattr namesへ混ぜない。

現行ResourcePolicy/Capsが直接持つのはattempts/total/live/namesだけ。payload/retryは元budgetの責務で、role全体のFD/管理allocation/列挙bytes等は別の保護された必要量・capの検査器が必要。未知のdimensionを落として「PolicyCaps全体確認済み」としない。scan内5 ownerはOS FD総数ではなく、外側量を足すだけでFD保証とも呼ばない。

ResourceInput/Quotasを計算器が発行してはいけない。必要量が承認cap以内であることを確認後、resources専用moduleが**承認capの配賦値**からpartsを作る。roundごとに違うcapを保持し、全slotへ同じ丸い余裕値を配らない。local Quotasにはtotalがないため、totalはsession ResourcePolicy側の検査を残す。両者のissuer/slotと値の整合をPolicyCaps消費時に検査する。

## 7. profile供給順序と循環の解消

### 7.1 採らない経路

- scanして実測値を得る→cap承認→scanを許可、という循環。
- 事前with_roundでprofileだけ作ってscope/treeを捨て、通常Initialで再decodeする4回目のparse。
- ScanShapeProfile/RoundDeclarationをscope外へ持ち出す、receiptを借用中にそのownerをmoveする自己参照構造。
- 未承認のraw summaryやcloneしたprofileで寿命/発行元検査を回避する方法。

### 7.2 推奨案：安定した外側所有者＋Initial bootstrap継続

**将来の内部API変更を伴う設計案**として、receipt/context/targetを外側の固定保持領域で安定させ、Initialの既存with_round継続内でpolicy検査からInitial kernelまでを完結させる。owner自身が自分へのborrowを格納する型やPin/unsafeの寿命延長は作らない。

| 順序 | 責務・出口条件 |
|---:|---|
| P0 | 固定cap原票/ModelBundleとBootstrapCapsを検証。同budgetへone-shot bootstrap claim。未承認なら開始しない |
| P1 | 元上限内でreceipt/hash/record/context/held由来を検証。安定した外側receipt所有者と、別の可変source所有者を用意する |
| P2 | **Initialの予定decodeそのもの**を一度実行し、同scope/declarationからScanInputsとcount-only profile/estimateを作る。scan/sourceは未開始 |
| P3 | 同estimateからResourceRequirementWitnessと他dimensionの必要量を得る。ApprovedCapsと照合し、同scope内でPolicyCapsEvidenceを発行・消費 |
| P4 | 同policy partsと固定3slotを照合するSlots段階へ進み、公開前checkpoint。独立ScanSlotsCheckedの成功票だけでは代替しない |
| P5 | 初めてsession claimを開始しResourceInputを一度configure。同じInitial scope/declaration/profile/estimateを固定Initial処理へ引き継ぐ |
| P6 | Initial完了/strict ackとwith_round末尾checkpoint後、従来のB/recheck/M4/AfterM4へ進む。後続2roundはfresh scopeで各1decode |

BootstrapCapsはdecode/JSON要素/bytes、count-only配列/収集費、保持量/解放、元期限内の限定準備だけを許す。scan Quotas/ResourceInputや全体受付の代用品ではない。既存構造上限以下の有限値と係数/allocator上界を承認・強制する設計が必要で、現在はその承認値/producerとも未対応。元budgetを新設/満額補充しない。

現行EvidenceInputs→HeldEvidenceInputs→ScanSlotInputsはreceiptを**値で移動**するため、P2後にそのまま既存run_creationへ渡すことはできない。安定した外側receiptへのborrowを使う準備計画/固定callerへの接続と、Initial kernelへ既存declarationを渡す入口が必要である。これは本書の承認待ち依存事項であり、現実装に既にある機能としない。

現合成Records issuer内のInitial decodeは単独試験用。統合時にP2と重ねて実行せず、その検証責務をInitial bootstrapへ移す所有表が必要。3decode・6record厳密検証、scan前後の意味検査・後続fresh profileを削らない。profile claimをresetして同ScanInputsから二度収集もしない。

P1の初回record厳密検証は、既存Initial BeforeScan側の1回を担当する案であり、7回目を追加するものではない。P1/P2の実検証結果を固定phaseへ引き継ぐ型付き完了証拠と、同Initial scopeで既存kernelへ入る入口が必要。caller指定のpassed boolやphase setterで再検証を省略しない。残るInitial AfterScanと後続2roundの計5回は維持する。この責務移動の所有表・順序/型検証が成立しない限りP5へ接続しない。

## 8. 一度限りの消費・session移譲

PolicyCapsEvidenceの発行/消費はsession未開始の元budget/bridge claimへ結合する。承認cap revision/digest/期限、同model bundle、同requirement issuerと元index/receipt/context/held系列、partsの同一性・未使用状態を再確認する。検査途中の失敗後に同じcapで別partsを発行し直さない。

PolicyCapsCheckedを値でSlots段階へ渡し、同policy parts/3slot/必要profileの結合を確認後だけ公開できる案。型付き公開前checkpointまで成功しても、全体work/resource受付が未確定なら実scanへ進まない。Bootstrap継続の成功を一般の実行権へ変換しない。

session生成後のconfigureは別段階であり、pre-session証拠guardをそのまま再実行しない。同じ元origin/claim/started/receiptと、未configure・ExpectInitialを検査し、partsを一度moveする。資源会計の実消費・共有retry・cleanup予約を保持し、configureのやり直し・round毎のpolicy再生成・未使用分による枠再付与を禁止する。

## 9. 失敗分類と解放

| 条件 | 主理由と処理 |
|---|---|
| cap/BootstrapCaps/モデル/必要dimension/発行元が不明・未承認 | Unavailable。scan開始前停止、fallbackなし |
| issuer/receipt/role/root/model bundle identity/slot/予算/状態違い、二重消費 | Binding。双方の元claimへ停止を伝播 |
| cap期限切れ | Expired。wall/mono/元期限の異常は既存clockの理由を保持 |
| 必要量>cap、構造上限超過、checked算術overflow | Limit。cap増額/切詰め/飽和値で回避しない |
| 宣言/metadata/hash/timeの実変更 | Changed/HashMismatch等、元検証器の第一理由を保持 |
| Deadline/Cancelled/先行sticky failure | その理由で固定停止。新work/新source/新sessionを開始しない |

生成/供給拒否はInputRejectedのSupply(PolicyCaps)へ位置・第一理由を保持し、profile/record本体や承認者情報・pointer/path/秘密は出さない。新しいclock/cap細分類が必要なら有限の内部診断として別設計し、文字列を生で流さない。

claimへ先行理由をlatchしてから一時Witness/profile/estimate借用を閉じ、固定ownerが未使用slot/parts/source/held/receiptを所定順に解放し最後のcheckpointを観測する。scope/declarationを借用中に外側ownerをdrop/moveしない。予約済みcleanupは取消/期限/work不足でも実施し、確認不能は別診断として保持する。NotReachedをClosed/解放済みに変えず、既存Outer診断を捨てない。

## 10. 費目所有・合成テスト・承認待ち

新規費目候補はcap原票/ModelBundle認証、bootstrap guard/収集、保護projection、resource計算、dimension別cap照合、発行/消費claim、partsの結合/移譲、公開前checkpoint、固定discard/管理量。現行resource計算9行、profile収集/guard、work計算15行等を再実行/二重計上しない。正確な固定費・拒否prefix・allocation上界は未導出で、未知項を0にしない。既存17や供給証拠23候補へ固定余裕を足した上界を認証しない。

合成受入条件：

1. ApprovedCaps/BootstrapScope/Witnessを専用test issuer以外から構築できず、raw数値/summary/任意ScanOpsからの発行を拒否する。
2. 固定bundleの未知/新旧混在・改変、cap revision/digest/role/期限の違い、同値別ownerを拒否する。
3. 全dimensionの境界±1、overflow、retry集中/最後の異常試行、xattr最後1回最大copy、round/session totalの非同一性を検査する。
4. 外側held/管理量不足・未対応dimension・BootstrapCapsなしでdecode/scanを開始しない。P0〜P6の中断・失敗prefixを個別検証する。
5. Initial decodeを追加せず、profile二重収集やscope/borrowの持出し・receipt移動を型/compile-fail試験で拒否する。実scope内に既存estimateを1回消費する。
6. issued/used/parts移譲はone-shot。失敗・drop後も回復せず、同budget停止・解放・上位診断を保持する。
7. PolicyCaps→Slots順を固定し、独立ScanSlots片だけでpolicy/供給公開を成功にできない。全体受付/本番registryは未承認なら停止する。
8. work/操作/resourceの独立oracleと実計数で全3round成功/拒否/取消を比較し、固定評価セット・旧offline契約を維持する。

次の作業案は、PC-01（型/承認原票/ModelBundleの内部契約を合成issuerのみ）、PC-02（保護profile projectionと純粋cap比較器）、PC-03（one-shot parts配賦と証拠消費）、PC-04（bootstrapの寿命/固定caller再設計・compile-fail検証）、PC-05（PolicyCaps→Slots/Initialへの統合）とする。PC-01〜03の単独成功を運用受付成功にしない。

承認待ち：capの責任者・全数値・固定build配布/失効手順、BootstrapCapsの強制と保持量上界、ModelBundle原票/係数版、必要dimensionの全体coverage、安定した外側所有者への内部API移行、全体work/resource受付、実backend。これらが確定するまで本番policyはNone、全体受付は無効のままとする。
