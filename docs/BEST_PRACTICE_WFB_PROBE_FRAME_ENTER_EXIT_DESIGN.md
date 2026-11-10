# WF-B (C)：同startのprobe-only frame・一度限りenter／確認済みexit接続差分

(B)接続差分の詳細化（2026-11-10、MDのみ）: [内部型・grant捕捉・固定exit責務・公開診断draft-0.1](BEST_PRACTICE_WFB_PROBE_GRANT_EXIT_DUTY_DESIGN.md)で、同RunLinkへのone-shot enter、通常受付と失敗後unwindのguard分離、grant格納前の参照非出力projection、(C)へ渡すheld_unsealed境界を具体化した。body・grant発行・退出処理の実装はまだ行わない。

B-01限定実装（2026-11-10）: 上記設計§12で状態型・RunLink／dutyの先行準備と新入口の固定projectionを実装した。[検証記録](E2E_BEST_PRACTICE_WFB_PROBE_RUN_PREPARATION_2026-11-10.md)。同start結合・準備postまでで、利用claim消費・grant発行・body起動・退出確認は閉鎖を維持する。

B-02限定実装（2026-11-10）: 上記設計§13で、同startの一度限りenter・合成grant候補の同参照捕捉・失敗prefixと同dutyへの責務保持を接続した。[検証記録](E2E_BEST_PRACTICE_WFB_PROBE_GRANT_CAPTURE_2026-11-10.md)。useはentering、grantはprovisionalまでで、active／body／退役／確認済みexit・正式発行・実接続は閉鎖のまま。

B-03前半の詳細化（2026-11-10、MDのみ）: [固定exit・局所退役・同duty責務保持draft-0.1](BEST_PRACTICE_WFB_FIXED_EXIT_LOCAL_RETIREMENT_DESIGN.md)で、先行first／stop後も同dutyだけを処理するprivate境界と、body未開始のheld_not_startedを設計した。本文のbody完了後held_unsealed／PX05とは別で、body起動・確認済みexit・正式発行は追加しない。

Version: draft-0.2 / Date: 2026-11-10 / 読み取り開始HEAD: `fb02aab`、文書確認時HEAD: `470679f`（(A)レビュー修正基準HEAD: `75adab5`）。

draft-0.2のレビュー修正（MDのみ）：(A)のstart側受領物照合のうち単独対照で裏付けられるのはcellsだけで、他は到達しない二重防御である点を§11に明記した。

Status: **当初draft-0.1に対し、(A)の同start wrapper最小抽出・先行private cell／同bindingだけ合成依存限定で実装。** 実装基準HEAD `74bb73c`、詳細は§11と[検証記録](E2E_BEST_PRACTICE_WFB_PROBE_FRAME_PREPARATION_2026-11-10.md)。親は[正規gate生成・継続入口](BEST_PRACTICE_WFB_GATE_ROOT_CONTINUATION_DESIGN.md)と[WriterGate／frame権限](BEST_PRACTICE_WFB_WRITER_GATE_FRAME_DESIGN.md)。前工程の実績は[非実行draftの検証記録](E2E_BEST_PRACTICE_WFB_CANONICAL_GATE_DRAFT_2026-11-09.md)。新probeのbody起動・grant発行・退出証拠は存在しない。

正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。当初作成時はMDのみ、今回の実装とローカル検証は§11の範囲だけ。実接続・実通信・設定変更・Pushを行わない。新経路のrequest／close実合流、回収開始、実writer、Journal封印／供給、admission消費、packet生成、field clear、GateClosedRecord、root終端も対象外。

## 1 読み取り基準と今回の差分

現行`RetirementStartAssembly.prepare()`は`#frame=true`の区間で`generationFrame()`を呼び、その中で`#binding.prepare()`へ進む。finallyは`#frameExits++`と`#frame=false`を更新する。既存requestはframe中にdeferredを返し、frame外では回収claimを消費し得る。これを直接probe入口に使うと、検証対象外の生成／回収まで実行してしまう。

現行`CanonicalGateDraftRoot`の`#frame`は**root構築中**の印で、startの生成frameではない。37段階のpost到達、`ready`、`frameExecutions=0`は将来の実行資格や退出証拠ではない。slot37の`Object.freeze({state:'unused',draft})`も現状では不変descriptorであり、stateを書き換える実行台帳として使わない。

作業開始時にはcomposition fixtureとcanonical-gate-draft試験に、構築中closeの返答を`closeInFrame`へ観測する未コミット変更があった。本作業では変更せず保持し、文書確認時には別途`470679f`としてコミット済みとなった。その観測値は同startのexit確認ではない。

今回設計するのは、同start内の固定wrapper境界、別private実行台帳、同grant保持、確認済みexitまで。旧factory・旧試験は維持し、第2start／第2gateを作らない。純粋WriterGate fakeのbrand／台帳／summaryを正規rootへ採用しない。

## 2 同startの固定wrapperと入口配置

将来の最小抽出は同start class内で、所有確認・frame進行・body呼出し・結果捕捉・finallyの機構を共有する。旧prepareは旧generation bodyへ進み、新しい正規private継続だけが固定probe bodyへ進む。別assemblyに似たwrapperを書くだけでは「同start保証」としない。

固定bodyの選択はlexicalな継続で行い、外部のmode・関数・callback・返却objectによる切替を受け付けない。新経路で`canonical_generation`を選ぶ継続は閉鎖し、既存seed付きstartの旧prepareを迂回入口にしない。旧seedなしfactoryの互換維持と、新seed経路のgate必須条件を分ける。最小抽出時にも現行公開APIの意味を勝手に変更しない。

probeは固定return／固定throw／固定cancel結果と再入用の有限合成イベントだけ。binding.prepare・source生成・実writer・Journal操作を一切呼ばない。取消は合成ラベルであり、実I/O取消や実worker停止を実証しない。await・非同期継続・外部hook・通知をwrapper内へ入れない。

元draftは`executable=false`のまま保持し、booleanをtrueにして権限化しない。同rootが保持するdraftとprivate入口originを照合した**固定継続**が利用slotを一度消費する。draft／grant／start／退出候補はpublicに返さない。新しい合成試験入口を設ける際も固定scriptと値診断だけとし、既存`check()`を暗黙にrunnerへ変えない。

## 3 private内部型とgrant保持slot

以下は型案であり、public export・外部登録口ではない。型名だけの一致やcastを発行根拠にしない。

| 内部型／slot | 内容・正規生成元 | 最大数と所有者 |
|---|---|---|
| ProbeFrameBinding | 同seed／target／gate／pin／scope／epoch／packet origin／draft／entry／exit origin | 1。同rootがprivate保持し、同start内部参照も照合 |
| FrameUseCell | unused／entering／active／exiting／finished／unconfirmed、attemptUsed、同draft参照 | 1。現行slot37とは別のmutable private台帳、rootと同startが同cellを参照 |
| FrameOrigin | 同probe frameだけの固定origin | 1。実行前に生成・捕捉。構築originや退出originとは別 |
| CanonicalProbeGrant | private brand、同gate／owner／pin／epoch／frame origin、固定probe phase | 1。発行元は正規lexical継続のみ。実payload writerの資格を持たない |
| GrantRetention | stage=empty／attempting／provisional／active／revoked／unconfirmed、current／issued／拒否候補、未捕捉責務 | 1。先行root shellが全参照を保持し、同startは同slotを借用 |
| BodyCompletionCell | not_started／running／returned／threw／cancelled／unconfirmed、同frame／固定body origin | 1。raw例外を保持／公開せず、固定結果だけを記録 |
| ExitRetention | candidate／issued／accepted同参照、生成stage、退役確認flag、固定完了状態 | 1。候補生成前から先行root shellに存在 |
| ProbeFrameExitRecord | 同binding／frame／grant／draft／exit origin、probe body完了、grant退役、probe継続残存なし | 1。内部記録だけ。GateClosedRecord／cleanup証拠／RootStopAckではない |
| FrameDiagnosticCell | construction／producer／probe／gate／frame各first、phase／boundary、refusal、未解決責務 | 固定1組。故障後もfirstを上書きせず参照custodyを継続 |

先行shellの現行grant／frameExit空fieldは保持の起点として再利用できるが、上記cell類とoriginはenter前に生成・捕捉・post検査する。従来37段階の成功を追加cellの捕捉成功に読み替えず、将来実装で固定追加scheduleと故障点を明示する。新たな無制限list／再試行別slotは作らない。

台帳の正規所有者は先行root shell。同startはprivateに同参照を捕捉し、rootとstartがそれぞれ独立のused／active／exit値を進めない。既存`#frame`等の互換診断への反映は、このcellの確認済みphaseに従う。origin／scope実値は公開診断へ出さない。

## 4 一度限りenter：検査順と開始点

| 段階 | 固定操作 | 失敗時の扱い |
|---|---|---|
| PE00 | shell／追加cell捕捉済み、root構築終了・post済み、stopなし、既存construction firstなしを確認 | frame未開始。元診断保持、追加生成なし |
| PE01 | current／issued seed・draft・pin・target同参照、同start内部owner／issued claim／binding、既存scope／epoch／packet、entry／exit originを個別確認 | identity拒否。grant=0、body=0 |
| PE02 | gate open・bound、use unused、attempt未使用、start frame未開始、probe phase固定を確認 | 二重開始／再入はrefusal。正規処理のfirst・退出能力を壊さない |
| PE03 | attemptUsed=trueとuse=enteringを無allocation・無hook・無awaitの同期区間で固定 | **一度限り利用の開始点**。以降unusedへ戻さない |
| PE04 | grant stage=attempting、固定constructorを最大1回呼び、返却物を直ちにprovisional捕捉 | 呼出し後未捕捉は未知のgrant責務。第2発行なし |
| PE05 | grant current／issued同参照・brand・固定field数・全binding fieldを照合しpost確認 | 拒否候補を保持。body未開始、未確認の退役を成功扱いしない |
| PE06 | use／grantをactiveへ同期固定し、同startの固定probe bodyを最大1回開始 | active後の故障でも固定exit継続の責務は残る |

PE01では既存`constructionMatches()`の未消費回収claim条件を使えるが、後のexitにその関数を無条件流用しない。probeは回収claimを消費しないため、本段階では正規unusedが期待値。将来request合流で正規spentが生じる場合は、同origin／issued参照とphase別条件を別検査にする。

単にgrant参照を持つことは実行権限ではない。同cellのactive、同startの固定private入口、同frameを要求する。PE03以後のgrant生成／捕捉／active確定失敗で補完発行・attempt払い戻し・別frameへの付替えを禁止する。

## 5 確認済みexit：退出確定点

body結果とexecution exitを別に扱う。return／throw／cancelのどれでも正規固定継続の退出を確認できればexitは成立し得るが、probe失敗を成功へ書き換えない。失敗結果を固定返却するためのguardが、必要な退出継続まで短絡してはならない。旧prepareのcatchからの`failFrame()`／`request()`をprobeへそのままコピーしない。

| 段階 | 固定操作 | 未確認時 |
|---|---|---|
| PX00 | bodyから制御が同start wrapperへ戻った／固定例外を捕捉したことを同BodyCompletionCellへ記録 | body未捕捉・escaped可能性があればunconfirmed。結果ラベルだけでは代用不可 |
| PX01 | use=exitingへ進め、新body／grant使用を閉じる | 再入exitはrefusal。第2退出候補を作らない |
| PX02 | 同start／cell／grant current・issued／draft／frame／exit origin、body完了、probe継続残存なしを再検査 | 元grant・借用・元firstを保持しexit_unconfirmed |
| PX03 | grantをrevokedへ同期固定し、同grantの退役状態を確認 | 退役未確認をactive=0で補完しない |
| PX04 | 内部退出候補を最大1回生成し、先行ExitRetentionへprovisional捕捉。全field・同参照を照合 | 未捕捉／候補不一致は保持してunconfirmed、再発行なし |
| PX05 | 最終preflight後、accepted退出slotとuse=finished／start inactiveを同期確定 | **確認済みexitの確定点**。途中確保・hook・通知・awaitなし |
| PX06 | 固定値診断へ結果を反映。将来drainに必要な退出状態だけを保持 | 返却／通知故障でも退出記録と先行firstを消さずbodyを再実行しない |

PX05の複数field更新をprivate直接slotだけで行い、再入可能処理やthrowし得る確保を置かない。実装がこの同期区間を保証できない場合はexit_unconfirmedとして停止し、finished／inactiveを公表しない。`#frameExits++`は試行診断、`finally`は退出処理を呼ぶ機構であって、いずれも退出証拠そのものではない。

PE03後active未達の場合はprobe未開始のまま、同正規参照の捕捉／退役確認可否を記録する。確認できないgrantを「body未実行だから不存在」としない。active到達後の例外では、固定exit継続を一度試み、body結果・退役結果・退出候補生成結果を別々に保持する。故障前にrevokedまで進んだ場合も、PX05未確定ならfinishedではない。

probeには実leafがない。実leaf数を0に設定したことで全writer退出確認済みにしたり、ここでの内部退出記録を正規generationのFrameExitRecordへcastしたりしない。GateClosedRecord・closed成功・root終端・Journal readinessは発行／設定しない。

## 6 失敗時の所有責務・固定保持

| 失敗prefix | 同rootが保持する物と責務 | 禁止する扱い |
|---|---|---|
| 先行cell捕捉前 | shellがあれば捕捉prefix・未捕捉構築責務。実OOM以前の診断必着はUnknown | 全cell未生成／cleanup済みとの断定 |
| PE03前のidentity／stop拒否 | 同start・gate・seed・draft・元診断。grant/body未開始 | foreign参照への差替え、別startで再試験 |
| PE03後grant未捕捉 | used attempt・entering cell・元参照・未知grant責務 | 未使用へ復元、第2grant発行 |
| provisional grant拒否 | current／issued／拒否候補と退役未確認flag | slotを空にして未生成へ戻す |
| active後body throw／cancel | 元probe firstとbody結果、同grant、必要な固定exit継続 | 元理由をexit成功で消す、exitをfirst guardで省略 |
| PX03後・PX05前故障 | revoked履歴・候補prefix・元借用・退出未確認責務 | revokedだけでinactive／finishedへ進める |
| PX05後の結果故障 | accepted内部記録・退役grant・fixed first・同start参照 | 第2退出・body再実行・cleanup完了への昇格 |

本段階では固定discard・外部custody移譲・borrow退役を追加しない。未解決責務が残る間は先行ownerが参照を保持する。確認済みexit後も、将来のrequest／drainとの移譲契約がない間は同rootに保持し、「解放済み」とは報告しない。publicな診断コピーからowner／grant／内部記録を再建できる口を作らない。

gate first・frame first・元producer first・probe outcome・重複refusalは別slot。重複enter／exitだけでgateをunconfirmedへ壊さない一方、entering／exitingの実操作・退役が未確認ならgate／frameの未確認診断を固定する。失敗後も一度限りの正規exit責務と新規開始禁止を区別する。

## 7 request合流との境界（今回は未接続）

停止検査用の固定fakeイベントを将来導入する場合も、同rootのstop latch／閉鎖済み入口を検査する範囲に限定する。既存`start.request()`／`start.close()`を呼んで回収開始を先取りしない。現行root構築中の`deferred_frame`と、新しいprobe実行中のdeferredを別診断で保持する。

enter前stopはbody=0・grant新規発行0。entering中の未捕捉grantはunconfirmedとして保持する。active／exiting中stopは新規開始を閉じ、同固定exitだけを許す。退出後のdrain要求は未消費pending状態として保持し、実drain・回収claim消費は0。将来request合流は、このaccepted退出slotとphase別claim検査を消費する別工程とする。旧requestをgate用とstart用に二度呼ぶ方式は採らない。

## 8 費目所有・上界と未導出項目

先行追加cell・binding検査・grant発行／捕捉／退役・内部退出候補・固定診断はgate／frame ownerの追加費目。旧bodyや旧回収の費用をここへ重複計上しない。probe body最大1、grant constructor試行最大1、退出候補生成試行最大1、同時frame最大1。再入refusalも無費用とはせず、有限script／呼出し上限は独立に設計する。

この最大数は構造契約であって実allocation数やwork料金ではない。既存37slotを追加費目込みの上界として流用しない。追加cellの生成schedule・各guard呼出し数・unit係数・実E／S・実確保layout・実OOM・escaped資格なしの実証はUnknown。将来共有予算に接続する際も既存停止owner・D_stop／D_endを引き継ぎ、新予算／残時間起点の期限を導入しない。今回のMDは全体受付を可能にしない。

## 9 独立合成受入条件（段階別実施範囲は§11）

| ID | 受入条件・負の対照 |
|---|---|
| PF01 | 同startのwrapper共有を経路で確認。probeからbinding.prepare／source生成／Journal実操作へ進む変異をsentinelで検出。別startの模擬成功では代替しない |
| PF02 | 同seed／scope／owner／claim／epoch／packet／draft／entry／exit／frame各fieldとcurrent／issuedを単独混入。狙った拒否phaseとbody/grant回数でmaskingを排除 |
| PF03 | 追加先行cell・PE00〜06の前後故障でused／捕捉prefix／未知責務を独立oracle比較。grant再発行・attempt復元・第2bodyを検出 |
| PF04 | enter再入／二重開始／exit再入／二重exitを分離。副作用0・first不変と、残る正規退出可能性を確認 |
| PF05 | return／throw／cancel×退役／退出確認済み・未確認の直積で結果とexecutionを独立比較。元first保持、throw後のexit省略を検出 |
| PF06 | PX00〜06各故障、未捕捉退出候補、grant退役不整合・同値copyを検査。finallyだけ、counterだけ、revokedだけのfinished化を検出 |
| PF07 | PX05直前／直後の観測でaccepted record・finished・inactiveの部分成功公開なし。commit区間への確保／hook挿入を負の対照にする |
| PF08 | stopをenter前／entering／active／exiting／exitedへ配置。後続drain pendingだけ、回収開始0・回収claim消費0・再open0を確認 |
| PF09 | constructionMatchesの未消費条件をexitへ誤流用しない境界を確認。将来spent試験はrequest接続後であり、今回成功扱いしない |
| PF10 | 固定返答／通知故障後も元診断・未解決参照を保持。値診断／copyからgrant・退出記録を復元する変異と秘密出力を拒否 |
| PF11 | 旧factory／旧試験／純粋fakeの独立brand不変。新試験入口は梱包除外、公開APIに任意bodyやtoken採用口なし |
| PF12 | canonical generation／実writer／Journal／admission／packet／field clear／GateClosedRecord／root終端／実接続は未接続。probe終了を全writer停止・正式証拠へ昇格させない |

oracleは本体のbuilder／state表／counterから期待値をimportせず、有限イベントと独立sentinelでprefixと実呼出しを確認する。compiledでは単独条件を外したときの到達phaseを検査し、冗長guardと未到達条件を別記する。今までの1,166件成功をPF01〜12の成功に読み替えない。

## 10 次の実装分割と今回の文書確認

将来の分割は、(A)同start wrapper最小抽出・先行private cell／同binding・実行閉鎖、(B)one-shot enter／同grant捕捉・固定probe、(C)確認済みexit・失敗後の保持・compiled対照、その後に別承認でrequest／close合流とする。(A)ではbodyを起動せず、(B)は固定退出責務を伴って初めて実行を試験する。enterだけ起動して退出未設計のまま完了としない。

本書と親2文書だけを更新した。今回ビルド・合成試験・compiled試験・梱包は行っていない。3文書のローカルリンク16件に欠落なし、PF01〜12の12条件に重複・欠落なし、PE00〜06／PX00〜06各7段階の順序と差分空白を確認した。ソース／試験のSHA-256は開始時と同一（composition: `b10e59224bb3cdb58252569b68b8020805de0e598cd2fa159dec028b9bca7dad`、試験: `ed193bf428992a394960499dd533e918632894be8195d59c352fa40c5beead50`）。これは文書整合の確認であり、未実装frameの検証成功ではない。本MD変更は未コミット、Pushなし。

## 11 (A)限定実装（2026-11-10）

§10末尾は文書作成時の記録（後に`74bb73c`でコミット）。今回の変更は同composition fixtureの合成経路だけ。既存startのprepareの先行拒否を維持し、その後のframe開始・旧body・catch／finally・旧drain処理をprivate `frameBoundary`へ最小抽出した。旧seedなしfactoryは同wrapperから従来の合成generation bodyへ進む。新seed付きstartとprivate probe_closed経路はwrapperのframe開始前に恒久拒否する。旧回帰試験の合成body実行と、新probe body起動0を区別する。

新factory `createProbeFramePreparationFake`は旧CanonicalGateDraftRootを同lexical配置で利用し、固定scriptだけを受付ける。旧factoryの形と旧互換facadeのexportは変更しない。compositionの試験用export一覧には新factoryを追加する。公開されるのはprepare／check／checkLegacy／close／inspectだけで、checkとcheckLegacyはいずれも実行拒否の確認口。enter／exit／任意callback／grant採用口は存在しない。

追加固定8段階は、1 use cell、2 frame origin、3空grant cell、4未開始body cell、5空exit cell、6固定診断cell、7private bundle、8同binding。1〜7を旧30段階の空slot確保後・gate／seed／issuer構築前に生成・捕捉する。8は既存37段階post照合後に生成・捕捉し、同root／issued参照・brand／固定field数と全関係を照合してから同startへ一度bindする。8のpost確認まで新rootのreadyは立てない。旧37段階と追加8段階は別の保持表で、45回の実allocationという意味ではない。

ProbeCellBundleは同先行rootが所有し、use／frame／grant／body／exit／diagnosticの正規参照を固定。ProbeFrameBindingは同seed・target・gate・pin・scope・owner・epoch・packet・draft・entry／exit・同bundleを保持する。start側も同binding current／issuedと同bundleのprivate捕捉を別々に確認する。二重bindは何も変更せず拒否。初回拒否候補やpost失敗時のstart借用は元rootに保持し、rollbackで消さず再生成しない。

cellの型はこの段階ではunused／empty／not_startedと未使用・未発行だけを表現する。mutable private cellの遷移、attempt claim消費、grant発行／退役、退出候補生成、PX05、request／drainはまだ実装していない。診断cellは先行空slotで、実際の構築失敗first・prefixは既存rootのfailure shellが保持する。既存不変slot37と`executable=false`のdraftは変更しない。

PF01のwrapper共有／新経路body閉鎖部分、PF02の供給・受領同一性部分、PF03の追加8段階構築部分、PF04の構築再入／重複bind部分、PF10〜12の保持・互換・閉鎖部分を検証した。enter／exitのPF03〜09実行部分・正常probe body・退出確定・実request合流・全writer停止は未実施。独立prefix oracle32条件、新65試験、関連1,231件、新旧compiled11本・build・strict検査・梱包結果と初回エラーは[検証記録](E2E_BEST_PRACTICE_WFB_PROBE_FRAME_PREPARATION_2026-11-10.md)。構造枠は全体work受付へ昇格させず、unit係数・実E／S・layout・実OOM・runtime停止はUnknownのまま。

start側`probeMatches()`のうち単独対照（`start_cells_copy`、compiled receiver対照）で裏付けられるのは`b.cells === this.#probeCells`だけである。`b.target.start === this`、`b.seed === this.#gateSeed`、`b.owner === this.#owner`、`constructionMatches()`、draft／entry／exitの関係は、root側binding前段と同じstart・同参照を先に検査するため到達しない二重防御。bind時の`probeMatches()`結果とpostの`probeStartAccess.matches()`は互いをmaskする二重防御、`checkFramePreparation()`の再照合と`#closed`条件も到達しない。将来start側だけを変える経路（request合流後の受領物更新等）を追加する際は、これらに単独対照を先に用意する。
