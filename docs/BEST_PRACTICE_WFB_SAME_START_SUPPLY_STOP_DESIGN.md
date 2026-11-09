# WF-B (C)：同startへのprivate結合・配置生成と停止／供給の接続差分

gate／frame継続入口の詳細化（2026-11-09、MDのみ）: [正規rootのgate生成・同owner結合とframe継続入口draft-0.1](BEST_PRACTICE_WFB_GATE_ROOT_CONTINUATION_DESIGN.md)で、RC00〜RC05の配置生成順、同gate seed、正規scope／epoch結合、draftの保持と実行の区別を整理した。全writer coverage前は正規生成bodyを開かず、Journal供給・admission消費・packet生成は閉鎖のままとする。

WriterGateの詳細化（2026-11-09、MDのみ）: [内部型・frame権限・退出確認とclosed確定点draft-0.1](BEST_PRACTICE_WFB_WRITER_GATE_FRAME_DESIGN.md)で、同owner結合、単一生成frame／leaf権限、deferred停止、実行退出とpayload失敗の区別、closedの同期確定・失敗時保持を具体化した。現行SS03をwriter停止・Journal供給の保証へ昇格せず、新経路は未実装のままとする。

Version: draft-0.2 / Date: 2026-11-09 / 基準HEAD: `b8dc4b3`（SS03実装レビュー修正基準HEAD: `69e5fbf`）。

draft-0.2のレビュー修正：SS03のstart側照合（`constructionMatches()`）は呼出し全体を外しても試験が通り、start内部のowner／claim／pin／spent／binding pinだけをずらす対照がなかった。`scope_*`は`scopeMatches()`と`constructionMatches()`の両方で拒否され、互いに覆い隠していた。issuerの状態条件にも対照がなかった。§9へstart内部だけの単独対照7種とissuer拒否対照を加え、`scopeMatches()`呼出しの冗長性を明記した。

実装追記（2026-11-09）: 最小値kernel配置と実issuer／同startの先行構築・SS03のdescriptor結合部分だけを合成依存で実装した。writer停止・Journal供給は未接続。[今回の検証記録](E2E_BEST_PRACTICE_WFB_CANONICAL_SUPPLY_CONSTRUCTION_2026-11-09.md)。

Status: **先行構築・readonly private結合だけ合成実装。writer gate・正規metadata供給は未実装。** 親は[private供給・先行保持境界](BEST_PRACTICE_WFB_JOURNAL_ISSUER_SUPPLY_DESIGN.md)と[Journal／packet設計](BEST_PRACTICE_WFB_JOURNAL_PACKET_DESIGN.md)。[先行shell検証記録](E2E_BEST_PRACTICE_WFB_JOURNAL_SUPPLY_SHELL_2026-11-09.md)は独立合成assemblyの保証であって、同start接続の保証ではない。

正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。初版はMDのみ、今回の実装は§9に限定する。writer停止・Journal供給・実接続・実通信・設定変更・Pushを行わない。以下の内部型・gate・継続・理由は設計案または合成契約であり、admission消費・packet生成・値capture・field clear・証拠・root終端を許可しない。

## 1 読み取り差分と採用する配置

現行shellは独立moduleの合成start・別brand・別台帳で、実issuerへ渡す口がない。既存CaptureAdmissionAssemblyはcomposition内で自身のRetirementStartAssemblyを構築し、そのstartがbinding／sourceを所有する。JournalAssemblyも別constructionなので、そのscopeや診断を既存issuerへ採用しない。

配置は次の二層とする。

- **値／空保持の共通kernel**：固定C→F layout、有限stage・slot遷移、固定理由・prefix計算だけを依存のない開発専用moduleへ最小抽出する。source／start／Journal／runtimeのimport、任意mint callback・artifact登録、正規originの発行を持たない。既存shellはその薄い合成rootとして残し、別brand・台帳・旧試験を維持する。
- **正規生成・結合のlexical root**：`snapshot-read-composition-fake.ts`の既存issuer／startと同じprivate配置に置く。実startの構築、scope検査、Journal参照借用、writer gateへの権限をこのrootだけが持つ。kernelに実sourceやJournalを渡して汎用adapter化しない。runtime／配布物への移動はしない。

独立shellのTargetDescriptorを正規descriptorへcast・copy・登録してはならない。正規rootは自分の先行slotと既存startからdescriptorを一度生成する。既存factoryのexport集合・関数同一性・未接続経路は維持し、新接続の合成入口は固定scriptと値診断だけに限定する方針。共通化で既存sourceや停止動作を勝手に差し替えない。

## 2 生成順と同一性の固定

| 段階 | 実施内容／保持先 | まだ許可しないもの |
|---|---|---|
| SS00 | 最小FailureShell・固定結果slotを先行確保 | owner実確保以前の診断必着はUnknown |
| SS01 | 空供給slot・packet保持slot1・cell保持slot25・静的layout・未使用admission slot・WriterGate保持slotを確保 | 実packet／cell／source生成 |
| SS02 | payloadを持たない正規WriterGateを一度構築・捕捉し、同issuerの実startを一度構築・捕捉 | 別startによる未捕捉の補完 |
| SS03 | startの正規owner／pin／claimをprivateに照合し、既存issuerのscope／epoch／packet originと先行slot／gateを一度結合 | prepare、仮ownerの正規化、最終anchor発行 |
| SS04 | 全先行slotの確認後、既存prepareの同一生成frameだけを実行 | 新しい生成frame・別source採用 |
| SS05 | 同startの回収要求・frame退出確認・全writer閉鎖・停止確認 | Journal sealだけによる停止代用 |
| SS06 | 正規Journal封印・scope／generation epoch結合 | admission消費・空packet生成 |
| SS07 | 既存issuerの発行完了後に最終anchor／viewをprivate受理 | preparedを実行権限へ昇格 |

SS00〜SS03はconstructorのfield副作用も含めて保護区間へ置く。既存の`#epoch`／`#packetOrigin`は1組だけを再利用し、移動時に第2tokenを発行しない。WriterGateはstart生成前から存在するが、正規ownerとの結合前は生成開始に使用不可。start／bindingのconstructorはsource準備・payload mintを行わないことを別に確認する。constructorに新しいwriterが増えたらこの順序を再設計する。

`captureStartAccess.scope()`はfresh wrapperを返すため、rootは既存issuerが保持する`#scope`自体を正規参照として使う。start側のowner・issued pin・claimと各fieldを再検査し、wrapperの参照一致で代用しない。一方、Ack／pin／admission／descriptor内のscopeは正規`#scope`との同参照を要求する。construction・retention・sourceSlot・claim・capture epoch・packet originのいずれかがforeignならSS03で固定拒否し、source生成0のまま止める。

## 3 停止gateの内部契約

新しいWriterGate案はpayload-freeなprivate identityと有限状態だけを持つ。同startからbinding／同source／同controlへ正規private生成継続で結合し、外部から付替えできない。public scope・inspect・control identityからgateを復元しない。旧未接続fixtureには新gateを暗黙投入せず、その経路の回帰を維持する。

| 状態 | 開始／継続の扱い |
|---|---|
| unbound | 正規owner／construction未結合。prepare・payload writer開始不可 |
| open | 同startの確認済み生成frame tokenでのみ固定writerを実行可能 |
| stop_requested | 新frame／新prepareを拒否。既に進行中の正規frameは既存契約で終了させるが、再入による別生成は不可 |
| closed | frame退出確認・active writerなしを確定。全payload writerを実操作前に拒否。再open不可 |
| unconfirmed | frame／writer退出未確認。新規操作を拒否し、未解決責務を保持。closed証拠を発行しない |

生成frame tokenは同frame内で固定再利用するprivateな実行資格であり、各loop／要求ごとの新tokenにしない。writer入口／出口は同tokenと同gateを確認し、active writerの未完了を記録する。同期でも任意hook・probe・再入があるため、`#requested`だけをframe退出の証拠にしない。深さ・費用の実上界は別検証が必要でUnknown。

回収requestではまず新frameを閉じる。frame activeなら既存deferred経路へ合流し、payload書込みを途中で打切って履歴だけ成功にしない。frame inactive・退出確認済み・active writerなし・正規pin／claim確認後にgateをclosedへ同期固定する。既存回収開始claimはその既存経路だけで最大1回。供給claimは別台帳で、preflight後に一度bound→preparingへ進める設計を維持する。

**Journalのbegin／write／release／retireは停止gateではない。** 現行wrapperは記録受付が失敗してもoperationを呼ぶため、gate検査を実writerのoperationより前に置く。Journalへ記録しただけで実書込みを止めたと扱わない。closed後の拒否は元slotを変更せず、固定違反診断を残し、Journalのlive readinessにも反映して供給postを拒否する。frame／参照を確かめるためにforeign methodを呼ばない。

## 4 全writerの費目・停止coverage表

「全writer」は以下の同construction内のpayload・生成履歴対象を指す。未知の新writerはcoverage不足として供給を拒否し、この表を更新する。将来の承認済みfield clearとは別である。

| ID | 実writer群 | 停止前の記録／closed後の拒否点 |
|---|---|---|
| WG01 | binding prepare・context(C25)・source slotのattempt／capture | frame開始前とprivate binding prepare入口。未開始sourceをknown-not-createdで固定後は生成不可 |
| WG02 | source準備のC01〜C11、building配列のpush・release・commit、reissue／probeIssued | source生成frame内の固定writer入口。rootの通常利用gateに加え同WriterGateを確認。array参照が同じでも内容書込みを対象から漏らさない |
| WG03 | binding anchor／payload／claim／control／receiptのcurrent・issued各alias、probeReceipt／probeCore | 各mint／代入の実操作前。同一生成frame由来の正規gateだけを使用 |
| WG04 | extraClaim(C17)／extraControl(C20)の故障script代入 | script分岐もwriterとして閉じる。未開始かつ生成機会終了後のみnever-assignedを確定 |
| WG05 | source `#normalControl`への初回bind、control `#live`の初期生成 | 正規bind／mint継続に同gate結合を要求。既存control.stateだけで後付けbindを許可しない |
| WG06 | control `retireLiveBinding()`のlive除去(C14) | 実controlの除去点で拒否。呼出し元のJournal記録だけで防がない。seal前の正規退役はreleased、seal後は実除去0 |
| WG07 | 旧source.clear／fail→clear／close→clear／finishの参照破棄・borrow退役 | 各実破棄前のgate。既存root retirement sealによる旧clear拒否を維持し、finishや別cleanupによる迂回も拒否 |
| WG08 | source／bindingの世代・発行slot・正常状態を再利用可能へ戻す書込み | closed後の再pin／再prepare／issued差替えを拒否。失敗処理で正常slotへ復元しない |

WG06では同controlがsource・binding・extra aliasから到達可能でも、実live cellのownerに置くgateで統一する。immutableなpayload-free origin／identityは保持する。source control bindやcontrol retireはC01〜C25以外の関係も変えるため、単に25fieldだけを閉じてcoverage完了としない。

closeRequested・readStop・元firstのsticky更新、供給診断、固定deferred状態は停止通知でありpayload writerと分離する。closeをroot retirement sealの代用品にせず、新epochを作らない。停止後に許すJournal操作は次節の固定終端metadataと拒否診断だけで、任意fact修復・旧clearの追加実行は許可しない。

## 5 正規metadata供給・Journal封印の順序

private経路は「同CaptureAdmissionAssembly → 自身のstart → 自身のbinding → source slotの実sourceと正規Journal」だけ。既存`sourceJournalAccess`／`bindingJournalAccess`を、外部からJournalを渡す口にせず、同startを起点とする閉じた継続へ束ねる。停止後に通常用の`source.check`／`supplyTransferAccess.capture`／`matches`を使い直さない。通常gateの拒否やfail経路を誤って呼んでclear・診断上書きを招かないため、正規metadata専用readerを使う。

1. **preflight／供給開始**：同start running、frame退出、同scope／epoch、先行slot結合を確認し、供給claimだけを一度消費。ここでは発行前admissionを要求しない。元producer失敗は回収対象の履歴として保持し、生成成功へ直さない。
2. **writer閉鎖**：SS05のclosed状態と正規control／source結合を確認。source_backedでは既存issuerのroot seal段階へ合流し、同rootを最大1回sealする。供給側が別のroot seal経路を呼ばない。
3. **variant固定**：source_backedは捕捉済みsource slot・source origin・root origin・source producer scope／epochを照合。local_onlyは同slotのknown-not-created checkpointと生成frame終了を使い、source reader／root sealを呼ばない。attempting／unknownやcontrol mint未確認は拒否。
4. **Journal終端metadata**：gate closed後、privateな固定終端継続だけが既存writer履歴を確かめ、never-assigned／not-mintedを確定してJournalをsealする。payload代入は行わない。先に完了したbuilding commit／旧clear履歴を後付けで成功へ変更しない。
5. **正規借用と世代結合**：binding14枠、source_backedだけsource11枠の同Journalを借用。generation epochを変更せず、正規owner／scope・既存capture epochへ結合する。sealed・firstなし・writing／candidate／unconfirmed残存なしを検査し、releasedはmetadata履歴として保持するがabsence成功にはしない。
6. **発行後の結合**：既存issuerがAck／pin／admission／非実行draftをissuedへ固定した後だけ、正規originを最終anchorへ結合する。view生成→先行slotへprovisional捕捉→live post検査→供給prepared。admission消費0、packet／cell object0を維持する。

4のterminal metadata権限は同owner／Journal／producer epoch・closed checkpointに結合し、最大1回。全Journal writerを一般的に再openする権限ではない。Journalが既にseal済みなら同終端結果を確認するだけで再発行しない。片方だけseal後に失敗してもunsealや第2Journalで補完しない。

viewはprivateなlive metadata借用であり、inspect snapshotやコピーしたfact listではない。postと将来consumer preではgate closed、同frame終了、正規source variant／epoch／scope、Journal first／ready、同current／issued artifactを再検査する。拒否writerでJournalに新故障が加わった場合、以前のpreparedだけを根拠に通さない。型／producer／coverage未対応はUnknownとして拒否する。

## 6 所有権・失敗prefix・保持責務

| 失敗位置 | 元参照と部分生成物の保持先 | 禁止する回復 |
|---|---|---|
| 先行shell／gate／start構築中 | 同constructionの先行FailureShell、捕捉済みslot、未捕捉attempt責務 | 第2start／仮ownerで補完しない。診断owner以前のOOMはUnknown |
| SS03のowner／scope混入 | 正規start・供給先slotと拒否候補を別に保持 | scope copyや別brandを正規化しない。prepare0 |
| 生成frame activeのrequest／close | 同startが元source／bindingとactive frame責務を保持、供給はdeferred | frameを強制完了／unknownをinactiveにしない |
| writer途中throw／gate退出未確認 | 同producerの元slotとJournalの未確認履歴、上位failure slot | closed証拠・known-absence・部分成功の補完なし |
| gate closed／root sealだけ成立 | 同ownerが元全slotと停止prefixを保持 | gate再open・旧clear・正常利用へ戻さない |
| 片Journal seal／世代結合失敗 | 同producerが履歴を所有、供給slotが借用と未確認責務を保持 | Journal再生成・scope／epoch再採番なし |
| issuer issued後／anchor・view生成中 | 正規issued artifactとprovisional anchor／viewを同先行slotに保持 | issuerを未発行へ巻戻さず、consumerだけを閉じる |
| view post／close／新Journal故障 | 同ownerがview・元診断・live故障を保持 | 第2viewや過去snapshotで成功を復活させない |

producer source／binding／Journalの所有権は同startに残り、metadata供給ではpayloadのtake／detachをしない。借用は生成frame内から同issuerのprepared／failure slotへ引き継ぎ、frame未確認なら退役済みにしない。後工程の固定discardが退役できるのは供給借用だけで、元25fieldやcontrol liveの解放確認ではない。まだ存在しないcustodyへ移譲済みと報告しない。

診断はproducer first、Journal first、issuer first、supply firstと最初のphase／writer IDを分離してsticky保持。公開診断にsource／Journal／gate参照・origin実値・本文・path・raw例外を含めない。反復要求は固定結果のみで、要求ごとに履歴・token・退避ownerを増やさない。

## 7 独立受入条件（未実施）

| ID | 狙う保証・拒否段階 |
|---|---|
| ST01 | 同issuerのstartが1つだけで、全先行slot／gateの確認前はprepare0。各構築境界faultで捕捉prefixと未知責務を独立表照合 |
| ST02 | 同値copy・別brand・別start／owner／scope各field／epoch／packet混入をSS03で拒否。fresh wrapperだけを理由に正規経路を拒否しない |
| ST03 | WG01〜WG08を個別に実行し、closed後の各実代入／配列変更／live除去／borrow退役が0。Journal記録を外してもgateで止まることを確認 |
| ST04 | frame内request・再入・closeはdeferred、新frame拒否、既存frame終了確認後だけclosedへ進む。active writer未退出はunconfirmed |
| ST05 | root seal・producer gate・Journal終端metadata・Journal seal・issuer issued・view postの固定順と各最大回数を独立イベントoracleで照合 |
| ST06 | source_backed／local_only／source unknown／control mint未確認を分離。local_onlyはsource reader／root seal／追加source生成0 |
| ST07 | control liveのseal前退役はreleasedでfactなし、seal後はlive参照不変。全aliasからの経路を同gateで拒否し、absence成功へ昇格しない |
| ST08 | terminal metadata権限の別owner／epoch／Journal／checkpoint・二重使用を拒否。任意payload writerやfact修復を開かない |
| ST09 | 部分封印・anchor／view未捕捉・provisional post故障で元slot・先行診断・未知責務を保持。unseal／第2start／第2viewなし |
| ST10 | sealed view後の拒否writer故障をlive post／将来preで検出。実closeだけでepochを再発行せず、元firstも保持 |
| ST11 | 共通kernelは実source／Journal／origin発行を持たず、旧合成rootと正規rootのbrand／台帳を分離。旧factory互換と配布物の負の対照を維持 |
| ST12 | 供給preparedでもadmission利用unused、packet／cell object0、値capture0、新field clear0、証拠0、root終端0、秘密非出力 |

期待値は本体writer表・layout・counterをimportせず別記述する。compiled変異では狙う段階と実書込み回数を確認し、後段の同参照guardだけでmaskしない。本文を持たない固定sentinelで元参照不変を確認する。全体回帰・梱包・実OOM保証への昇格はしない。

## 8 費目所有・実装分割・今回の確認

共通kernelの有限計算／先行確保／供給claim／借用／postは供給owner、既存prepareの実writerはproducer、回収開始／root sealは既存start／issuer、追加gate検査と拒否診断は各writer入口に帰属させる。共有予算／停止owner・既存D_stop／D_endを引き継ぎ、別予算・残時間起点の期限を作らない。gate／terminal metadata／Journal sealの追加費用・layout・guard・bootstrap実E／SはUnknownで、構造枠数を全体work受付へ採用しない。

実装は(1)最小kernel配置と正規先行構築／SS03、(2)全writer gate・frame合流と停止coverage、(3)同startの正規metadata reader・Journal封印、(4)既存発行後のanchor／view postと借用退役の順に分割する。停止coverageが未確認ならmetadata供給へ進めない。admission consumer・packet生成はさらに別工程である。

今回は着手時HEAD `b8dc4b3`のcompositionと既存設計を読み取り確認した。着手時に作業中だった`journal-supply-shell.test.ts`と`compiled-journal-supply-shell.mjs`は変更せず、内容hashの一致を確認した（終了前に別コミット`132b1b7`へ収録済み）。本作業では試験を実行せず、その別作業の試験保証を新接続の根拠に使わない。新MDと親2文書のみを更新。ビルド・試験・梱包・実装は未実施。3文書のローカルリンク14件、SS00〜SS07の8段階、WG01〜WG08の8群、ST01〜ST12の12条件の重複・欠落なしと差分空白を確認した。文書整合の確認であり実装coverageの証明ではない。今回のMDは未コミット、Pushなし。

## 9 最小kernelと正規先行構築の実装境界（2026-11-09）

- 共通kernelは開発専用`tests/review/fixtures/supply-construction-kernel.ts`。固定25項目のC→F値配列とstage遷移関係だけを共有し、identity発行・payload・constructor callback・登録口を持たない。旧shellは独立module／brand／台帳を維持し、値kernelだけをimportする。
- 正規rootはcomposition内のCanonicalSupplyConstruction。新factory `createCanonicalSupplyConstructionFake`がprepare／check／close／値診断だけを返す。旧互換factoryのexportは不変、共通compositionのexport集合には新factoryを明示追加する。実start／issuerを外から受け取るadopt口はない。
- 先行FailureShellと固定35捕捉枠→結果shell(1)→供給slot(2)→packet空保持(3)→layout(4)→cell空保持25個(5〜29)→admission未使用slot(30)→WriterGate**空保持slot**(31)→既存CaptureAdmissionAssemblyの構築・捕捉(32)→同start／正規scope／既存epoch／packet originのdescriptor(33)→未消費claim(34)→同参照の結合先(35)という順序。
- SS02のwriter gate本体と停止権限はまだ作らず、31は予約保持slotだけ。SS03もreadonly descriptor結合に限定する。新しい正規rootは既存issuer constructorを一度呼ぶため、そのissuerが所有する実RetirementStartAssemblyを使い、合成start代役・第2startは作らない。issuer／startのprepare／request／admit／closeは呼ばず、source未生成・内部admission未発行・root seal0のまま。
- issuerの正規scope参照・epoch・packet originをprivate static継続で取得・照合する。start側は正規owner／issued pin／claimの各fieldと未消費状態も再確認する。fresh scope wrapperは値再確認用で、正規`#scope`の参照を置換しない。別brand・同値copy・余剰field・別start／scope／epochは結合前に拒否する。
- start内部の照合は、issuerのscopeを整合させたままstart側だけをずらす単独対照で確認する。対象は`start_owner_copy`（claimOwner）、`start_claim_copy`（claim同一性）、`start_pin_copy`（pin同一性）、`start_claim_owner`、`start_claim_pin`、`start_claim_spent`（構築時に発行claimを消費済みにする固定script。request／frameは呼ばない）、`start_pin_construction`（binding pin照合だけが拒否）。`issuer_rejected`は構築時に入力拒否したissuerで、状態条件だけが拒否する。いずれもcompiledで対象条件を外すとboundへ進むことを確認する。
- `scopeMatches()`の呼出しは、`t.scope === a.#scope`の同参照検査と`constructionMatches()`のfield照合と論理的に同じ内容を確認するため冗長であり、単独で外しても検出されない（等価）。31枠confirmedの確認とkernelのstage遷移guardは到達しない防御条件である。
- 全生成点はbefore／attempt／provisional捕捉／confirmedを分離し、未捕捉と保持済みprefixを保持する。issuerCapturesは返却済みissuerの捕捉数であり、attempting時の内部確保を未生成と断定する件数ではない。元FailureShell以前の実OOM、constructor内部の未捕捉参照・診断必着はUnknown。
- ST01／ST02の構築部分とST11／ST12を部分検証。WG01〜WG08の停止、Journal reader／封印、SS04〜SS07、final anchor／view、供給claim消費・admission消費・packet生成は未接続。closeも外側診断の停止だけで、既存issuer.closeを呼んで停止処理を先取りしない。

初版§8末尾は文書作成時の記録（後に`5d16867`でコミット）。今回の実装は別の未コミット変更として検証記録へ保持する。追加費用・layout・実E／S・全体work受付はUnknownを維持する。
